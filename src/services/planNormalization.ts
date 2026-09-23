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
  cableAddon: string | null // e.g. "french-11", "movie-bundle", "india" — a cable add-on sold alongside (not instead of) a base tier; null for non-cable services or a tier-only cable plan
  cableDelivery: string | null // "dish" or "antenna" — StarTimes sells the SAME tier at two different prices depending on receiver hardware (satellite dish vs terrestrial antenna), a real distinct product, not formatting noise; null when a label doesn't specify (assumed to mean dish, StarTimes's default) or for non-StarTimes cable
  planFamily: string | null // e.g. "collabo", "always-on" — named data products with no fixed size (unlimited/capped-speed bundles); null for size-based data plans and non-data services
  bundleTag: string | null // e.g. "social", "binge", "night" — an app-restricted or time-restricted data variant layered on top of a normal sized plan; null for an unrestricted (general-purpose) data plan
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

// Restriction tags that ride ALONGSIDE size+validity+category on some
// labels — "200mb-social-plan-platforms-2day-gifting" is a plain-size
// "gifting" plan, but it is NOT the same product as an unrestricted
// "200mb-2day-gifting" plan: social/binge/night/youtube bundles are
// typically app-specific or time-window-specific data at the provider
// level (different activation, often not usable the same way as
// general data), same real-distinction rationale as CATEGORY_PATTERNS
// above. Without this field these labels were silently colliding with
// plain gifting/awoof plans of the same size+validity purely because
// CATEGORY_PATTERNS matched "gifting" and discarded everything else —
// a genuine merge bug, not a formatting fold. Order matters only in
// that more specific multi-word tags should be listed before a
// shorter fragment they contain; none currently overlap.
const BUNDLE_TAG_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "social", re: /\bsocials?[\s-]*(plan|bundle)?[\s-]*(platforms?)?\b/i },
  { key: "binge", re: /\bbinge[\s-]*(plan|bundle)?\b/i },
  { key: "youtube", re: /\byoutube\b/i },
  { key: "night", re: /\bnight[\s-]*(plan|bundle)?\b/i },
]

function extractBundleTag(text: string): string | null {
  const hits: string[] = []
  for (const { key, re } of BUNDLE_TAG_PATTERNS) {
    if (re.test(text)) hits.push(key)
  }
  if (hits.length === 0) return null
  // Multiple tags on one label (e.g. "binge-plan-youtube-social-plan-
  // data") describe one combined restricted product — join them so
  // e.g. a binge+youtube+social plan never collides with a plain
  // "social" plan of the same size+validity.
  return hits.sort().join("+")
}

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
    { key: "premium-french", re: /\bpremium[\s-]*french\b/i },
    { key: "premium-asia", re: /\bpremium[\s-]*asia\b/i },
    { key: "premium", re: /\bpremium\b/i },
    { key: "compact-plus", re: /\bcompact[\s-]*\+|\bcompact[\s-]*plus\b/i },
    { key: "compact", re: /\bcompact\b/i },
    { key: "confam", re: /\bconfam\b/i },
    { key: "yanga", re: /\byanga\b/i },
    { key: "padi", re: /\bpadi\b/i },
    { key: "asia", re: /\basia\b/i },
    { key: "french-touch", re: /\bfrench[\s-]*touch\b/i },
    { key: "great-wall", re: /\bgreat[\s-]*wall\b/i },
    { key: "indian", re: /\bindian(?:[\s-]*ultra)?\b/i },
    { key: "family", re: /\bfamily\b/i },
    { key: "access", re: /\baccess\b/i },
  ],
  GOtv: [
    { key: "supa-plus", re: /\bsupa[\s-]*plus\b/i },
    { key: "supa", re: /\bsupa\b/i },
    { key: "max", re: /\bmax\b/i },
    { key: "jolli", re: /\bjolli\b/i },
    { key: "jinja", re: /\bjinja\b/i },
    { key: "smallie", re: /\bsmallie\b/i },
    { key: "value", re: /\bvalue\b/i },
    { key: "lite", re: /\blite\b/i },
  ],
  StarTimes: [
    { key: "super-antenna", re: /\bsuper[\s-]*antenna\b/i },
    { key: "nova", re: /\bnova\b/i },
    { key: "basic", re: /\bbasic\b/i },
    { key: "smart", re: /\bsmart\b/i },
    { key: "classic", re: /\bclassic\b/i },
    { key: "super", re: /\bsuper\b/i },
    { key: "unique", re: /\bunique\b/i },
    { key: "global", re: /\bglobal\b/i },
    // "Uni" (Uni-1, Uni-2) and "Special" are real StarTimes tiers
    // distinct from the above — seen in raw catalog labels as bare
    // "uni-1"/"uni-2"/"special-weekly"/"special-monthly" with no other
    // recognizable tier word, so each needs its own explicit pattern
    // rather than falling through unconfident. Checked after the
    // longer/more specific patterns above so e.g. a label that also
    // contains "super" or "global" elsewhere isn't mis-claimed by
    // these shorter, more generic-sounding names.
    { key: "uni-1", re: /\buni[\s-]*1\b/i },
    { key: "uni-2", re: /\buni[\s-]*2\b/i },
    { key: "special", re: /\bspecial\b/i },
    // "Chinese" (Chinese Dish bouquet) — confirmed by observed live
    // label "chinese-dish-21-000-naira-1-month" — a real StarTimes
    // tier distinct from Global, not a formatting variant of it.
    { key: "chinese", re: /\bchinese\b/i },
    // "Shs" = StarTimes' own abbreviation for its SD/HD antenna
    // bundle tier, seen in raw catalog labels as "Shs Weekly 2800",
    // "Startimes Shs 2 800 Naira Weekly", etc. — the trailing number
    // is the naira price restated in the label (noise, not identity),
    // so it is deliberately NOT captured here; validity ("Weekly")
    // is picked up separately by the existing validity parser.
    { key: "shs", re: /\bshs\b/i },
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

// DSTV-only: opaque numeric variation codes used by VTU aggregators
// (VTpass/VTU.ng-style APIs) as the plan_code ITSELF, with no tier
// word anywhere in the label — e.g. raw label "dstv79" carries zero
// text CABLE_TIER_PATTERNS can match against. These must be an exact,
// case-insensitive, whole-string lookup, never a substring/regex test
// like the word patterns above: a fuzzy match on a bare number is how
// you accidentally deliver the wrong bouquet to a paying customer.
// Mapping confirmed independently across VTpass's own DSTV variation-
// code documentation and the VTU.ng-compatible aggregator convention
// (see migration skip-list dated 2026-09; PR discussion with
// Tobialpha). Codes seen in the skip list but NOT listed here
// (dstv9, dstv30, dstv33, dstv43, dstv45, dstv47, dstv62) are
// deliberately left unmapped — no source confirmed what bouquet they
// represent, and guessing would risk subscribing a customer to the
// wrong package. Add them here, with a source, once confirmed against
// Pairgate's actual variation list — do not guess from the price
// alone, since bouquet prices change independently of the code.
const DSTV_NUMERIC_CODE_MAP: Record<string, string> = {
  dstv79: "compact",
  dstv7: "compact-plus",
  dstv3: "premium",
  dstv10: "premium-asia",
  dstv6: "asia",
}

function extractDstvNumericCode(text: string, biller: string): string | null {
  if (biller !== "DSTV") return null
  const key = text.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return DSTV_NUMERIC_CODE_MAP[key] ?? null
}

// Cable ADD-ONS — sold alongside a base tier subscription rather than
// as one, e.g. DSTV's French channel packs, Showmax bundles, regional
// add-ons (Indian/Asian), and Complus/ExtraView. These are a genuinely
// different product shape from a tier: a customer's DSTV account can
// carry a base tier (Compact, Premium, ...) AND one of these add-ons
// at the same time, so folding an add-on into cableTier would treat
// "French 11" as if it were a competing alternative to "Compact"
// rather than a separate line item — and, in practice, is exactly why
// labels like "dstv-french-11", "french11", and
// "dstv-french-11-n10-800" (three spellings of the same real add-on,
// all ₦10,992-11,100) were never recognized by CABLE_TIER_PATTERNS and
// fell through to raw, unmerged, ugly slugs on the buy page.
//
// Longest/most-specific pattern first per biller for the same reason
// CABLE_TIER_PATTERNS orders that way — "premier-league" must match
// before a shorter fragment inside a longer label could mis-fire.
// A trailing "-n<price>" fragment some provider labels carry (e.g.
// "-n3500", "-n10-800") is NOT part of any pattern here — it's noise
// stripped by the generic cleanup already applied to rawLabel, not an
// add-on identity signal.
const CABLE_ADDON_PATTERNS: Record<string, Array<{ key: string; re: RegExp }>> = {
  DSTV: [
    { key: "movie-bundle", re: /\bmovie[\s-]*bundle\b/i },
    { key: "showmax-premier-league", re: /\bshowmax[\s-]*premier[\s-]*league\b/i },
    // Matches "French Plus Addon", "Dstv French Plus Add On N24 500",
    // and bare "Dstv French Plus" — all three observed spellings of
    // the same add-on (₦24,555-24,800). The trailing "N24 500" /
    // "N24500" price restatement is noise, not identity, so it's not
    // captured; ordered before the bare CABLE_TIER_PATTERNS "french-
    // touch"/generic matches would ever run since add-ons are checked
    // via extractCableAddon, a separate pass from tiers.
    { key: "french-plus", re: /\bfrench[\s-]*plus\b/i },
    { key: "french-11", re: /\bfrench[\s-]*-?\s*11\b/i },
    { key: "india", re: /\bindia[n]?[\s-]*add[\s-]*on\b|\bdstv[\s-]*india\b/i },
    { key: "asian", re: /\basian[\s-]*add[\s-]*on\b/i },
    { key: "complus-extraview", re: /\bcomplus[\s-]*(french[\s-]*)?extraview\b/i },
    { key: "extraview", re: /\bextraview\b/i },
  ],
}

function extractCableAddon(text: string, biller: string): string | null {
  const patterns = CABLE_ADDON_PATTERNS[biller]
  if (!patterns) return null
  for (const { key, re } of patterns) {
    if (re.test(text)) return key
  }
  return null
}

// StarTimes-specific: "dish" (satellite) vs "antenna" (terrestrial) —
// the SAME tier name (Basic, Classic, Nova, Super, Global) is sold at
// two different real prices depending on which receiver the customer
// has, confirmed by observed live labels like
// "basic-antenna-1400-naira-1-week" (₦1,400) vs
// "basic-dish-1-700-naira-1-week" (₦1,700) for the same "Basic"
// tier+validity. Without this distinction those two rows were
// silently colliding into one canonical code (basic-7d) during
// migration, which is a real pricing/product bug: whichever
// provider_plan_mappings row happened to merge-win would route ALL
// Basic-weekly purchases to just one receiver type's wholesale cost,
// even for customers who have the other kind of receiver. Only
// StarTimes labels carry this distinction in practice (DSTV/GOtv
// don't sell the same tier over two receiver types), so this is
// intentionally not a per-biller pattern map like CABLE_ADDON_PATTERNS
// — StarTimes is the only biller key checked.
function extractCableDelivery(text: string, biller: string, tier: string | null): string | null {
  if (biller !== "StarTimes") return null
  // "super-antenna" is its OWN tier name (see CABLE_TIER_PATTERNS)
  // that happens to contain the word "antenna" as part of its name,
  // not as a separate delivery-method signal — without this guard,
  // "super-antenna-weekly" produced the doubled, wrong code
  // "super-antenna-antenna-7d" instead of "super-antenna-7d".
  if (tier === "super-antenna") return null
  if (/\bantenna\b/i.test(text)) return "antenna"
  if (/\bdish\b/i.test(text)) return "dish"
  return null
}

// Named data products with no fixed MB/GB size — "Collabo" and
// "Always-On" are real MTN bundle families sold by validity+price
// tier rather than a data quota (often unlimited-at-reduced-speed, or
// social/app-specific). These need their own identity field, the same
// way cable has "tier" instead of "size" — the family name IS the
// product, not formatting noise. An unrecognized family name is NOT
// guessed at; it falls through to low-confidence, same as an
// unrecognized cable tier or an unparseable data size.
const DATA_PLAN_FAMILY_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "collabo", re: /\bcollabo\b/i },
  // "always-on" tolerates the real observed provider typo "alwavs"
  // (v instead of y — seen verbatim in a live ClubKonnect label,
  // "alwavs-on-n7000-30days") alongside the correct spelling, so this
  // typo'd row stops falling back to a raw, unmerged slug. Embedded
  // price fragments like "n7000" are not part of the match and are
  // simply ignored (not stripped) — they never end up in the
  // recomposed plan_code, which uses parsed.planFamily, not rawLabel.
  { key: "always-on", re: /\balwa[yv]s[\s-]*on\b/i },
]

function extractPlanFamily(text: string): string | null {
  for (const { key, re } of DATA_PLAN_FAMILY_PATTERNS) {
    if (re.test(text)) return key
  }
  return null
}

// Extracts size+unit anywhere in the text: "200mb", "1 GB", "1.5GB",
// "1.5TB", "500-mb" (dash used as a plain separator), "2-5gb" (dash
// used AS the decimal point — seen in provider labels like
// "2-5gb-weekend-plan..." meaning 2.5GB). GB/TB use 1000/1,000,000
// (not 1024/1,048,576) to match the marketing convention every
// provider's own labels already use ("1GB" meaning 1000MB in their
// plan names) — using binary units here would silently make a
// provider's own "1GB" plan fail to match another provider's "1000MB"
// listing of the identical plan, which is the exact bug this
// normalizer exists to fix. The unit pattern checks "tb" before "gb"/
// "mb" so "1.5TB" isn't partially matched by a shorter alternative.
//
// The dash-as-decimal case is tried FIRST and is deliberately narrow
// (single digit, dash, single-or-more digits, unit — e.g. "2-5gb",
// "3-55gb") so it only fires on genuine "N-Mgb" shapes and never on
// "500-mb" (a bare dash separator, no second digit group before the
// unit) or on a multi-segment code like "1-5gb-cg" being misread past
// where it should stop. Without this, "2-5gb-weekend..." was matching
// the plain pattern as just "5gb" — silently turning a 2.5GB plan
// into a 5GB one, which is a real correctness bug, not just a missed
// merge.
function extractSizeMB(text: string): number | null {
  const decimalDash = text.match(/\b(\d+)-(\d+)(tb|gb|mb)\b/i)
  if (decimalDash) {
    const value = parseFloat(`${decimalDash[1]}.${decimalDash[2]}`)
    const unit = decimalDash[3].toLowerCase()
    const mb = unit === "tb" ? value * 1_000_000 : unit === "gb" ? value * 1000 : value
    return Math.round(mb)
  }
  const match = text.match(/(\d+(?:\.\d+)?)[\s-]*(tb|gb|mb)\b/i)
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
// "Daily", "30 days", "1 Month", "2 Weeks", "500-mb-weekly-sme"
// (bare "weekly"/"monthly" with no leading number, implying 1 of that
// unit — same convention "Daily" already gets). "Daily"/"1 day" both
// mean 1 day — deliberately treated as equal since that's a wording
// difference, not a different validity; "Weekly"/"1 week" and
// "Monthly"/"1 month" now follow the identical pattern.
function extractValidityDays(text: string): number | null {
  const lower = text.toLowerCase()

  if (/\bdaily\b/.test(lower)) return 1

  const numeric = lower.match(/(\d+)\s*[- ]?\s*(day|days|d\b)/i)
  if (numeric) return parseInt(numeric[1], 10)

  const weeks = lower.match(/(\d+)\s*[- ]?\s*(week|weeks|wk)/i)
  if (weeks) return parseInt(weeks[1], 10) * 7
  if (/\bweekly\b/.test(lower)) return 7

  const months = lower.match(/(\d+)\s*[- ]?\s*(month|months|mo\b)/i)
  if (months) return parseInt(months[1], 10) * 30
  if (/\bmonthly\b/.test(lower)) return 30

  // "Weekend" plans (e.g. "875mb-weekend-plan-sun-awoof-data") are a
  // real, distinct validity window used by several Nigerian providers
  // — valid Fri/Sat through Sun/Mon, roughly 2-3 days — not a size or
  // category. Treated as its own fixed value (2) rather than left
  // unparsed, so these plans stop falling back to a raw, unformatted
  // slug on the buy page. Checked last (after day/week/month) so an
  // explicit day count elsewhere in the same label always wins.
  if (/\bweekend\b/.test(lower)) return 2

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
    const bundleTag = extractBundleTag(rawLabel)
    const sizeMB = extractSizeMB(rawLabel)
    if (sizeMB !== null) {
      // Normal size-based data plan — size + validity both required,
      // exactly as before. A size without validity is NOT confidently
      // parsed — do not guess.
      const confident = validityDays !== null
      return { networkOrBiller: normalizedNetwork, sizeMB, validityDays, category, cableTier: null, cableAddon: null, cableDelivery: null, planFamily: null, bundleTag, confident }
    }
    // No data size found — check for a named plan family (Collabo,
    // Always-On, ...) instead. These are real products identified by
    // name + validity (+ often an embedded price, which is NOT part
    // of the identity key — two providers' ₦2000 and ₦2500 versions
    // of the same family+validity are still priced separately via
    // provider_cost_kobo, not folded into plan_code). Confidence
    // requires BOTH the family to be recognized AND a validity to be
    // present — a recognized family with no validity is ambiguous
    // (which duration is it?) and is not guessed at.
    const planFamily = extractPlanFamily(rawLabel)
    const confident = planFamily !== null && validityDays !== null
    return { networkOrBiller: normalizedNetwork, sizeMB: null, validityDays, category, cableTier: null, cableAddon: null, cableDelivery: null, planFamily, bundleTag, confident }
  }

  if (serviceType === "cable") {
    // Cable's identity-bearing field is the package TIER (Compact,
    // Max, Nova, ...) — this is the cable equivalent of "size" for
    // data plans, a real product distinction, never folded away.
    // Validity ("1 Month") often accompanies it but isn't required —
    // some providers list a bare tier with no validity in the label
    // at all (validity is implied to be monthly). Confidence requires
    // EITHER the tier OR a recognized add-on (see CABLE_ADDON_PATTERNS
    // above) to be recognized — an add-on like "French 11" or "Movie
    // Bundle" is sold as its own line item, not bundled with a base
    // tier in the same label, so requiring both would make every
    // legitimate add-on unconfident. An unrecognized tier AND
    // unrecognized addon together is NOT guessed at, exactly like an
    // unparseable data size — this is what still correctly leaves
    // provider-internal numeric codes (dstv7, dstv79, dstv3, uni-2)
    // unconfident: those aren't a real tier or add-on name at all, just
    // an opaque package ID, and guessing which tier "dstv79" maps to
    // would risk delivering the wrong subscription. UPDATE: a subset
    // of these codes now HAVE a confirmed mapping (see
    // DSTV_NUMERIC_CODE_MAP above) — checked first, since a bare
    // numeric label like "dstv79" contains no text the word-pattern
    // CABLE_TIER_PATTERNS below could ever match anyway.
    const cableTier = extractDstvNumericCode(rawLabel, normalizedNetwork) ?? extractCableTier(rawLabel, normalizedNetwork)
    const cableAddon = extractCableAddon(rawLabel, normalizedNetwork)
    const cableDelivery = extractCableDelivery(rawLabel, normalizedNetwork, cableTier)
    const confident = cableTier !== null || cableAddon !== null
    return { networkOrBiller: normalizedNetwork, sizeMB: null, validityDays, category, cableTier, cableAddon, cableDelivery, planFamily: null, bundleTag: null, confident }
  }

  // Remaining non-size, non-cable plan-coded services (exam_pin,
  // epin): identity is a fixed token (denomination or pin type), not
  // size/validity/tier. Confidence just requires the label to
  // cleanly reduce to a short, stable slug — no size/validity/tier
  // extraction needed for these to be safely identity-matched on
  // cleaned text alone.
  const cleaned = cleanToken(rawLabel)
  const confident = /^[a-z0-9-]{2,40}$/.test(cleaned)
  return { networkOrBiller: normalizedNetwork, sizeMB: null, validityDays, category, cableTier: null, cableAddon: null, cableDelivery: null, planFamily: null, bundleTag: null, confident }
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
  // exam_pin has exactly two valid plan_codes — "registration" and
  // "result_checker" (see classifyExamPinType in providerPlanSync.ts,
  // and the fixed set the Buy Exam PIN page/purchase route validate
  // against). These MUST survive normalization byte-for-byte: the
  // generic fallback below (cleanToken) treats "_" as a non-
  // alphanumeric separator and rewrites it to "-", silently turning
  // "result_checker" into "result-checker" on every write path that
  // calls this function (upsertPlanMapping AND upsertPricingRule both
  // do). That mismatch is invisible in the admin UI — the mapping and
  // the pricing rule both look consistent with each other, both show
  // a live price — but neither one is the string the customer-facing
  // page or purchase route ever requests, so the plan is permanently
  // unmatchable no matter how many times it's synced or hand-edited.
  // Checking for the exact already-canonical values first (case/
  // whitespace-insensitive) means any caller that already has the
  // right value passes through untouched, before cleanToken gets a
  // chance to corrupt it.
  if (serviceType === "exam_pin") {
    const normalized = rawLabel.trim().toLowerCase()
    if (normalized === "registration" || normalized === "result_checker") {
      return { planCode: normalized, confident: true }
    }
  }

  const parsed = parsePlanIdentity(rawLabel, networkOrBiller, serviceType)

  if (!parsed.confident) {
    return { planCode: cleanToken(rawLabel), confident: false }
  }

  if (serviceType === "data" && parsed.sizeMB !== null && parsed.validityDays !== null) {
    const categorySuffix = parsed.category === "standard" ? "" : `-${parsed.category}`
    // Bundle tag goes last so e.g. an unrestricted "1000mb-1d-gifting"
    // never collides with a social/binge/night-restricted variant of
    // the identical size+validity+category — those are different
    // products at the provider level, not a formatting difference.
    const bundleSuffix = parsed.bundleTag !== null ? `-${parsed.bundleTag}` : ""
    return {
      planCode: `${parsed.sizeMB}mb-${parsed.validityDays}d${categorySuffix}${bundleSuffix}`,
      confident: true,
    }
  }

  if (serviceType === "data" && parsed.planFamily !== null && parsed.validityDays !== null) {
    const categorySuffix = parsed.category === "standard" ? "" : `-${parsed.category}`
    const bundleSuffix = parsed.bundleTag !== null ? `-${parsed.bundleTag}` : ""
    return {
      planCode: `${parsed.planFamily}-${parsed.validityDays}d${categorySuffix}${bundleSuffix}`,
      confident: true,
    }
  }

  if (serviceType === "cable" && (parsed.cableTier !== null || parsed.cableAddon !== null)) {
    // Validity is appended only when present in the label — many
    // cable catalogs list one row per tier with validity implied
    // (monthly) rather than stated, so its absence here does not
    // reduce confidence the way it does for data plans.
    const validitySuffix = parsed.validityDays !== null ? `-${parsed.validityDays}d` : ""
    // A tier and an addon are two different real products (a base
    // subscription vs. a standalone add-on pack) — never merge them
    // into one composed code even if a label somehow matched both.
    // Tier takes precedence when both are present, since an addon
    // pattern matching inside a full tier label (rare, but possible if
    // a provider ever writes "Compact + French 11" as one line) would
    // otherwise silently misfile a real tier plan under an addon key.
    const base = parsed.cableTier ?? `addon-${parsed.cableAddon}`
    // Delivery method (dish/antenna) is StarTimes-only and only ever
    // set alongside a tier (see extractCableDelivery — addons don't
    // carry it), placed between tier and validity so e.g.
    // "basic-antenna-7d" and "basic-dish-7d" stay two distinct plan
    // codes rather than colliding into one "basic-7d" that silently
    // picks whichever receiver-type row happened to sync/merge first.
    const deliverySuffix = parsed.cableDelivery ? `-${parsed.cableDelivery}` : ""
    return { planCode: `${base}${deliverySuffix}${validitySuffix}`, confident: true }
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

// Customer-facing safety net: does a STORED plan_code look like a
// properly composed canonical code (tier/size/validity words joined
// with "-"), or does it look like a raw, unnormalized provider slug
// that leaked through — a bare opaque code ("dstv45", "dstv62"), or a
// label that still carries provider noise words ("naira", "weekly"
// spelled out mid-slug instead of folded to "-7d"/"-1m", "startimes"
// repeated inside its own network's plan_code, a stray "addon-"
// duplicated, etc).
//
// This is intentionally a SHAPE check, not a re-run of the full
// parser — pricing_rules doesn't persist the `confident` flag
// canonicalPlanKey() computed at sync time, so this is the only signal
// available at read time. It exists to keep a not-yet-mapped code
// (like the still-unconfirmed dstv9/30/33/43/45/47/62 numeric codes)
// OFF the customer buy page even before an admin has had a chance to
// map it — those stay visible in the admin panel via listPlanGroups'
// admin-only counterpart, just excluded from what customers see.
// A false negative here (a valid code flagged as unclean) only hides
// a real plan from checkout — annoying but safe. A false positive
// (an unclean slug passing as clean) is the failure this exists to
// prevent, so patterns lean toward exclusion when in doubt.
const RAW_SLUG_NOISE_WORDS = /\b(naira|weekly|monthly|daily|dstv|gotv|startimes|showmax)\b/i
// Bare opaque numeric-suffixed codes like "dstv79", "dstv45" with NO
// separator before the digits — a real canonical code always joins
// words with "-", so a no-separator alnum blob is never one.
const BARE_OPAQUE_CODE = /^[a-z]+\d+$/i

export function isCleanPlanCode(planCode: string): boolean {
  if (RAW_SLUG_NOISE_WORDS.test(planCode)) return false
  if (BARE_OPAQUE_CODE.test(planCode)) return false
  // A digit run of 3+ consecutive digits inside the code is normally
  // a restated provider price ("...-2-800-...", "...-21000-...") —
  // but a data plan_code legitimately STARTS with a large size number
  // ("500mb-1d-gifting", "2000mb-30d" — see canonicalPlanKey's data
  // branch), so a leading digit run is exempted; only a 3+ digit run
  // appearing after the first segment is treated as noise.
  const afterFirstSegment = planCode.replace(/^\d+/, "")
  if (/\d{3,}/.test(afterFirstSegment)) return false
  return true
}
