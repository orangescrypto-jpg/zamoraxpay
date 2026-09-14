// src/services/planNormalization.ts
// Service abstraction layer — canonical plan-code normalization.
//
// PROBLEM: providers write the exact same real-world plan with
// different formatting — "75mb-1day-gifting" vs "MTN/110MB/1Day" vs
// "110mb-daily-plan-1-day-awoof-data" — and every table (pricing_rules,
// provider_plan_mappings) keys on plan_code as an EXACT string. So the
// same plan shows up multiple times on the buy page, each with only
// one provider behind it, and the cheapest-first router never sees
// more than one candidate for what is actually one product.
//
// FIX: canonicalPlanKey() is the single place that turns any
// provider's raw label into OUR plan_code. Every write (sync, admin
// manual entry, bulk CSV upload) and every read must go through this
// so the same real plan always produces the same string, regardless
// of casing, separators, or wording.
//
// WHAT COUNTS AS "THE SAME PLAN" — deliberately narrow:
//   size (in MB) + validity (in days) + category MUST all match.
// Only formatting noise is folded (case, "/" vs "-", "1Day" vs
// "1-day" vs "Daily"). Substance is never folded:
//   - 200mb-cg-7days is NOT the same plan as 200mb-gifting-2days
//     (different validity AND different category — two real products)
//   - 200mb-cg-7days from Pairgate IS the same plan as
//     200MB/7Days/CG from CheapDataHub (same size, validity, category —
//     just written differently) — these SHOULD merge into one
//     plan_code so the router can pick the cheaper provider.
// price is NEVER part of the identity key. Two providers selling the
// identical plan at different prices is the normal, expected case the
// cheapest-first router exists to handle — it is not a duplicate to
// resolve here.
//
// CATEGORY is preserved, not dropped. Gifting/Awoof/CG/CG_LITE/SME are
// operationally different products on the provider side (different
// activation rules, different failure modes, and for Pairgate
// specifically, plan_type is a required API parameter, not a label) —
// collapsing them would let the router silently substitute one
// category for another on fallback, which can deliver something
// different from what the customer saw, or fail for a category-
// specific reason unrelated to provider downtime. When a provider's
// catalog has no such distinction at all, category normalizes to
// "standard" rather than being left blank, so plans with an explicit
// category never accidentally collide with ones that have none.

export interface ParsedPlanIdentity {
  networkOrBiller: string // normalized, e.g. "mtn", "dstv"
  sizeMB: number | null // null when this isn't a size-based plan (e.g. cable, exam_pin)
  validityDays: number | null // null when no validity applies
  category: string // "standard" when the provider draws no distinction
  cableTier: string | null // e.g. "compact", "max", "nova" — cable's equivalent of size; null for non-cable services
  // True only when every field we needed was confidently extracted.
  // When false, canonicalPlanKey() falls back to a lightly-cleaned
  // version of the original text instead of guessing — a failed parse
  // must never silently merge two different plans.
  confident: boolean
}

// Delivery-method / category tags. Longest-first so "cg_lite" matches
// before the bare "cg" fragment inside it.
const CATEGORY_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "cg_lite", re: /\bcg[\s_-]?lite\b/i },
  { key: "gifting", re: /\bgift(ing)?\b/i },
  { key: "awoof", re: /\bawoof\b/i },
  { key: "cg", re: /\bcg\b/i },
  { key: "sme", re: /\bsme\b/i },
  { key: "corporate", re: /\bcorporate\b/i },
  { key: "direct", re: /\bdirect\b/i },
]

// Networks/billers this system already uses, so free-text like "mtn",
// "MTN", "Mtn Nigeria" all fold to the one convention every other
// table already stores ("MTN", "Glo", "Airtel", "9mobile", "DSTV",
// "GOtv", "StarTimes"). Anything not recognized here is title-folded
// generically rather than rejected, so a new biller doesn't break
// sync — it just won't get the exact-casing benefit until added here.
const NETWORK_OR_BILLER_LABEL: Record<string, string> = {
  mtn: "MTN",
  glo: "Glo",
  airtel: "Airtel",
  "9mobile": "9mobile",
  etisalat: "9mobile",
  t2mobile: "9mobile",
  m_9mobile: "9mobile",
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "StarTimes",
  showmax: "Showmax",
}

export function normalizeNetworkOrBiller(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return NETWORK_OR_BILLER_LABEL[key] ?? raw.trim()
}

// Cable package tier names, per biller. This is the cable equivalent
// of "size" for data plans — the actual product identity (DSTV
// Compact vs DSTV Premium are genuinely different subscriptions, not
// a formatting difference), so it must be extracted and preserved
// just as rigorously as data's size field, not folded away.
//
// Longest/most-specific pattern first within each biller so e.g.
// "Compact Plus" matches before the plain "Compact" fragment inside
// it, and "Confam" (a real DSTV tier) doesn't get swallowed by a
// shorter unrelated match.
//
// This list is necessarily incomplete — cable providers add/rename
// tiers over time. A tier not in this list falls through to
// tier === null, which means parsePlanIdentity treats that cable
// label as NOT confidently parsed (see below) rather than guessing —
// exactly the same "refuse rather than guess wrong" rule data sizes
// follow. New tiers should be added here as they're seen in a
// provider's real catalog, the same way NETWORK_OR_BILLER_LABEL is
// maintained.
const CABLE_TIER_PATTERNS: Record<string, Array<{ key: string; re: RegExp }>> = {
  DSTV: [
    { key: "premium-french", re: /\bpremium\s*french\b/i },
    { key: "premium-asia", re: /\bpremium\s*asia\b/i },
    { key: "premium", re: /\bpremium\b/i },
    { key: "compact-plus", re: /\bcompact\s*\+|\bcompact\s*plus\b/i },
    { key: "compact", re: /\bcompact\b/i },
    { key: "confam", re: /\bconfam\b/i },
    { key: "yanga", re: /\byanga\b/i },
    { key: "padi", re: /\bpadi\b/i },
    { key: "asia", re: /\basia\b/i },
    { key: "french-touch", re: /\bfrench\s*touch\b/i },
    { key: "great-wall", re: /\bgreat\s*wall\b/i },
    { key: "indian", re: /\bindian(?:\s*ultra)?\b/i },
    { key: "family", re: /\bfamily\b/i },
    { key: "access", re: /\baccess\b/i },
  ],
  GOtv: [
    { key: "supa-plus", re: /\bsupa\s*plus\b/i },
    { key: "supa", re: /\bsupa\b/i },
    { key: "max", re: /\bmax\b/i },
    { key: "jolli", re: /\bjolli\b/i },
    { key: "jinja", re: /\bjinja\b/i },
    { key: "smallie", re: /\bsmallie\b/i },
    { key: "value", re: /\bvalue\b/i },
    { key: "lite", re: /\blite\b/i },
  ],
  StarTimes: [
    { key: "nova", re: /\bnova\b/i },
    { key: "basic", re: /\bbasic\b/i },
    { key: "smart", re: /\bsmart\b/i },
    { key: "classic", re: /\bclassic\b/i },
    { key: "super", re: /\bsuper\b/i },
    { key: "unique", re: /\bunique\b/i },
    { key: "global", re: /\bglobal\b/i },
  ],
  Showmax: [
    { key: "mobile", re: /\bmobile\b/i },
    { key: "standard", re: /\bstandard\b/i },
    { key: "pro", re: /\bpro\b/i },
  ],
}

function extractCableTier(text: string, biller: string): string | null {
  const patterns = CABLE_TIER_PATTERNS[biller]
  if (!patterns) return null
  for (const { key, re } of patterns) {
    if (re.test(text)) return key
  }
  return null
}

// Extracts size+unit anywhere in the text: "200mb", "1 GB", "1.5GB",
// "1.5TB". Returns size normalized to MB. GB/TB use 1000/1,000,000
// (not 1024/1,048,576) to match the marketing convention every
// provider's own labels already use ("1GB" meaning 1000MB in their
// plan names) — using binary units here would silently make a
// provider's own "1GB" plan fail to match another provider's "1000MB"
// listing of the identical plan, which is the exact bug this
// normalizer exists to fix. The unit pattern checks "tb" before "gb"/
// "mb" so "1.5TB" isn't partially matched by a shorter alternative.
function extractSizeMB(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(tb|gb|mb)\b/i)
  if (!match) return null
  const value = parseFloat(match[1])
  const unit = match[2].toLowerCase()
  const mb = unit === "tb" ? value * 1_000_000 : unit === "gb" ? value * 1000 : value
  // Round to nearest whole MB — fractional MB in a provider label is
  // always a rounding artifact (e.g. "1.5GB" -> 1500), never a
  // meaningfully distinct plan size at sub-MB granularity.
  return Math.round(mb)
}

// Extracts validity anywhere in the text: "1 Day", "1day", "7Days",
// "Daily", "30 days", "1 Month", "2 Weeks". Normalized to days.
// "Daily"/"1 day" both mean 1 day — deliberately treated as equal
// since that's a wording difference, not a different validity.
function extractValidityDays(text: string): number | null {
  const lower = text.toLowerCase()

  if (/\bdaily\b/.test(lower)) return 1

  const numeric = lower.match(/(\d+)\s*[- ]?\s*(day|days|d\b)/i)
  if (numeric) return parseInt(numeric[1], 10)

  const weeks = lower.match(/(\d+)\s*[- ]?\s*(week|weeks|wk)/i)
  if (weeks) return parseInt(weeks[1], 10) * 7

  const months = lower.match(/(\d+)\s*[- ]?\s*(month|months|mo\b)/i)
  if (months) return parseInt(months[1], 10) * 30

  return null
}

function extractCategory(text: string): string {
  for (const { key, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return key
  }
  return "standard"
}

// Parses a raw provider label/plan-code into its identity fields.
// serviceType matters: only "data" plans are expected to have a
// size — cable plans use a tier name instead of a size — and
// exam_pin/epin plans are denomination/type-based with neither.
export function parsePlanIdentity(
  rawLabel: string,
  networkOrBiller: string,
  serviceType: string,
): ParsedPlanIdentity {
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const category = extractCategory(rawLabel)
  const validityDays = extractValidityDays(rawLabel)

  if (serviceType === "data") {
    const sizeMB = extractSizeMB(rawLabel)
    // A data plan with no extractable size, or no extractable
    // validity, is not confidently parsed — do NOT guess. Callers
    // must fall back to a cleaned-but-unmerged code for these so a
    // parsing gap never silently merges two different plans.
    const confident = sizeMB !== null && validityDays !== null
    return { networkOrBiller: normalizedNetwork, sizeMB, validityDays, category, cableTier: null, confident }
  }

  if (serviceType === "cable") {
    // Cable's identity-bearing field is the package TIER (Compact,
    // Max, Nova, ...) — this is the cable equivalent of "size" for
    // data plans, a real product distinction, never folded away.
    // Validity ("1 Month") often accompanies it but isn't required —
    // some providers list a bare tier with no validity in the label
    // at all (validity is implied to be monthly). Confidence requires
    // the tier to be recognized; an unrecognized tier is NOT guessed
    // at, exactly like an unparseable data size.
    const cableTier = extractCableTier(rawLabel, normalizedNetwork)
    const confident = cableTier !== null
    return { networkOrBiller: normalizedNetwork, sizeMB: null, validityDays, category, cableTier, confident }
  }

  // Remaining non-size, non-cable plan-coded services (exam_pin,
  // epin): identity is a fixed token (denomination or pin type), not
  // size/validity/tier. Confidence just requires the label to
  // cleanly reduce to a short, stable slug — no size/validity/tier
  // extraction needed for these to be safely identity-matched on
  // cleaned text alone.
  const cleaned = cleanToken(rawLabel)
  const confident = /^[a-z0-9-]{2,40}$/.test(cleaned)
  return { networkOrBiller: normalizedNetwork, sizeMB: null, validityDays, category, cableTier: null, confident }
}

// Lightly-cleaned fallback slug used both for the "couldn't confidently
// parse" fallback and as the final formatting step for non-data plan
// codes (cable/exam_pin/epin) that don't have distinct size/validity
// components to recompose from.
function cleanToken(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// THE function every write/read path must call. Turns a raw provider
// plan label (or an already-existing plan_code being re-normalized
// during migration) into the canonical plan_code we store and match
// on everywhere.
//
// Returns { planCode, confident }. When confident is false, planCode
// is still returned (a cleaned slug of the original) so sync/admin
// entry never hard-fails on an unparseable label — it just won't
// automatically merge with other providers' phrasing of the same
// plan until a human confirms it (see migration's low-confidence
// report).
export function canonicalPlanKey(
  rawLabel: string,
  networkOrBiller: string,
  serviceType: string,
): { planCode: string; confident: boolean } {
  const parsed = parsePlanIdentity(rawLabel, networkOrBiller, serviceType)

  if (!parsed.confident) {
    return { planCode: cleanToken(rawLabel), confident: false }
  }

  if (serviceType === "data" && parsed.sizeMB !== null && parsed.validityDays !== null) {
    const categorySuffix = parsed.category === "standard" ? "" : `-${parsed.category}`
    return {
      planCode: `${parsed.sizeMB}mb-${parsed.validityDays}d${categorySuffix}`,
      confident: true,
    }
  }

  if (serviceType === "cable" && parsed.cableTier !== null) {
    // Validity is appended only when present in the label — many
    // cable catalogs list one row per tier with validity implied
    // (monthly) rather than stated, so its absence here does not
    // reduce confidence the way it does for data plans.
    const validitySuffix = parsed.validityDays !== null ? `-${parsed.validityDays}d` : ""
    return { planCode: `${parsed.cableTier}${validitySuffix}`, confident: true }
  }

  // Any other non-data, non-cable plan-coded service with a validity
  // component recomposes from validity + category. In practice
  // exam_pin/epin have neither and fall through to the cleaned token
  // below instead.
  if (parsed.validityDays !== null) {
    const categorySuffix = parsed.category === "standard" ? "" : `-${parsed.category}`
    return { planCode: `${parsed.validityDays}d${categorySuffix}`, confident: true }
  }

  return { planCode: cleanToken(rawLabel), confident: true }
}
