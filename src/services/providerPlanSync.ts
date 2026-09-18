// src/services/providerPlanSync.ts
// Pulls ClubKonnect's live, no-auth plan/price list endpoints and
// upserts them into provider_plan_mappings, so an admin never has to
// hand-type plan IDs and wholesale costs for this provider — same
// spirit as VTUGate's international FX-rate live pricing, but for
// ClubKonnect's regular data bundle catalog.
//
// These specific ClubKonnect endpoints need only ?UserID= (no APIKey)
// per their docs, so this can run even before an admin finishes
// setting up ClubKonnect credentials — useful for previewing the
// catalog before going live.
//
// networkOrBiller is stored as the plain network name ("MTN", "Glo",
// "Airtel", "9mobile") to match the convention every other provider's
// mappings already use — NOT ClubKonnect's own 01/02/03/04 codes,
// which the clubkonnect.ts adapter re-derives at purchase time via its
// own NETWORK_CODE map.
//
// Only Data Bundle sync is implemented here today (the one with a
// genuine per-plan wholesale price list). Airtime pricing on
// ClubKonnect is a flat percentage discount off face value, not a
// per-item plan catalog, so it doesn't fit this same "sync a list of
// plan rows" shape — that stays configured the normal way
// (pricing_rules), same as VTUGate's non-plan-based services.
//
// Cable TV and exam pins (WAEC/JAMB) DO have genuine, no-auth,
// per-item catalog endpoints (APICableTVPackagesV2.asp,
// APIWAECPackagesV2.asp, APIJAMBPackagesV2.asp) — confirmed live
// against real responses, not assumed from docs — see
// syncClubkonnectCablePlans and syncClubkonnectExamPinPrices below.
// Cable TV packages do carry a PRODUCT_DISCOUNT_AMOUNT (their own
// authoritative charge-to-you price, already net of their flat
// per-provider discount), so despite that discount existing, the
// catalog is still a genuine per-package price list worth syncing —
// unlike electricity, which really has no per-item catalog at all
// (just a flat percentage off whatever amount the customer requests),
// so electricity remains configured manually via pricing_rules.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import { upsertPlanMapping, findMappingByNaturalKey, findMappingByProviderPlanId } from "@/src/services/providerPlanMappings"
import { canonicalPlanKey } from "@/src/services/planNormalization"

// Every sync function below calls a provider's HTTP API and expects
// JSON back. When a provider is down, the base URL is wrong, or the
// API key/auth is rejected, providers commonly respond with an HTML
// error/login page instead of JSON — calling res.json() directly on
// that throws a useless "Unexpected token '<', is not valid JSON"
// with no indication of what actually went wrong. This wrapper reads
// the body once, tries to parse it as JSON, and if that fails (or the
// HTTP status wasn't ok) throws a clear error naming the provider,
// endpoint, and status code instead — every call site below routes
// through this rather than `res.json()` directly.
async function parseJsonOrThrow(res: Response, providerLabel: string, endpointLabel: string): Promise<any> {
  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    const snippet = text.slice(0, 200)
    throw new Error(
      `${providerLabel} ${endpointLabel} returned a non-JSON response (HTTP ${res.status}). ` +
        `This usually means a wrong base URL, an auth failure, or the provider is down. ` +
        `Response started with: ${snippet}`,
    )
  }
  if (!res.ok) {
    throw new Error(
      `${providerLabel} ${endpointLabel} returned HTTP ${res.status}: ${json?.message ?? json?.error ?? text.slice(0, 200)}`,
    )
  }
  return json
}

const NETWORK_LABEL: Record<string, string> = {
  MTN: "MTN",
  Glo: "Glo",
  Airtel: "Airtel",
  "9mobile": "9mobile",
  t2mobile: "9mobile",
  m_9mobile: "9mobile",
}

// A plan_code that is purely numeric (optionally with a decimal, e.g.
// "100", "750.01", "90000.03") is never a legitimate identifier — it's
// either a raw provider price or a raw numeric package ID that got
// written to the wrong field. Real plan_codes are slugs like
// "1gb-7day-cg" or "ck-100". Every sync function below must reject
// plan codes matching this shape rather than writing them, so this
// specific failure mode (junk rows breaking the Buy Data dropdown)
// can't recur even if a future provider has the same bad habit.
function isNumericJunkPlanCode(code: string): boolean {
  return /^\d+(\.\d+)?$/.test(code.trim())
}

// Turns a provider's human-readable plan name/label (e.g.
// "1GB - 7 Days (Awoof Data)") into a stable, URL-safe plan_code
// (e.g. "1gb-7-days-awoof-data"). Used whenever a provider's API
// exposes a name/label field alongside a raw numeric ID, so plan_code
// stores something meaningful instead of that raw ID or a price.
function slugifyPlanLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Turns a provider's raw plan label into OUR canonical plan_code via
// canonicalPlanKey() (see planNormalization.ts) — so "75mb-1day-gifting",
// "MTN/110MB/1Day", and "110mb-daily-plan-1-day-awoof-data" from
// different providers land on the same string when they're genuinely
// the same size+validity+category, instead of each provider's own
// phrasing creating an invisible-to-each-other duplicate plan. Falls
// back to the plain slugified label (never a canonical recomposition)
// when the label couldn't be confidently parsed, so an odd label never
// gets silently merged into the wrong plan — see planNormalization.ts's
// `confident` flag.
function canonicalizedPlanCode(label: string, networkOrBiller: string, serviceType: string): string {
  const { planCode } = canonicalPlanKey(label, networkOrBiller, serviceType)
  return planCode
}

// exam_pin's ONLY two valid logical plan codes — the exact strings the
// customer-facing Buy Exam PIN page hardcodes and filters on
// (app/(dashboard)/services/exam-pin/page.tsx), and the exact strings
// the purchase route validates (app/api/vtu/exam-pin/route.ts) and
// passes through as planCode. pricing_rules / provider_plan_mappings
// MUST be keyed on one of these two values for a synced exam_pin plan
// to ever be visible or purchasable — nothing else the customer page
// requests will ever match.
//
// Every provider names these two products differently in their own
// catalog text ("WAEC Registration PIN" vs "WAEC Result Checker PIN",
// "Result Checker" vs "Scratch Card", "DE"/"Direct Entry" for JAMB
// registration-style products, etc.) — this classifies a provider's
// raw label/description into our two canonical codes instead of
// storing the provider's own wording or numeric ID as plan_code (the
// previous bug: ClubKonnect stored PRODUCT_CODE, VTUGate stored
// product_code, neither of which is ever "registration" or
// "result_checker", so no synced row could ever match what the buy
// page asks for, no matter how many times reconcile ran).
//
// providerPlanId (stored separately) still carries the provider's own
// raw code/id and is what's actually sent at purchase time — see
// vtuRouter.ts's planCodeOverride / networkOrBillerOverride, which
// substitute providerPlanId back in right before calling the adapter.
// Remapping plan_code here to our logical value never touches that.
// The only exam boards the customer-facing Buy Exam PIN page offers
// (see EXAM_BODIES in app/(dashboard)/services/exam-pin/page.tsx).
// Used to detect which board a provider's row/label refers to when
// the provider doesn't give a clean separate field for it.
const EXAM_BOARDS = ["WAEC", "NECO", "JAMB", "NABTEB"]

function classifyExamPinType(rawText: string): "registration" | "result_checker" | null {
  const text = rawText.toLowerCase()

  // Result-checker / scratch-card wording — used AFTER the exam to
  // check results. Check this first: some labels contain both
  // "result" and "registration"-adjacent words (e.g. "WAEC Result
  // Checker (for registered candidates)"), and "result checker" is
  // the more specific, unambiguous signal.
  if (/result\s*-?checker|scratch\s*-?card|checker\s*pin|check\s*(your\s*)?result/.test(text)) {
    return "result_checker"
  }

  // Registration / direct-entry wording — used to register for or
  // sit the exam. JAMB's registration-style products are often
  // labeled "DE" (Direct Entry), "UTME", or "Registration" rather
  // than the word "registration" itself.
  if (/registration|reg\s*-?pin|\bde\b|direct\s*entry|\butme\b|mock/.test(text)) {
    return "registration"
  }

  return null
}

interface ParsedPlan {
  network: string
  planId: string
  label: string
  priceNaira: number
}

// ClubKonnect's APIDatabundlePlansV2 returns a nested JSON object keyed
// by network name, each value an object/array of plan entries. Exact
// field names have varied across their doc revisions (DataPlan vs
// dataplan vs plan_id; Plan vs PackageName), so this reads several
// plausible aliases rather than assuming one fixed shape.
function parsePlansResponse(json: any): ParsedPlan[] {
  const out: ParsedPlan[] = []
  if (!json || typeof json !== "object") return out

  // ClubKonnect's real APIDatabundlePlansV2.asp response wraps every
  // network under a top-level "MOBILE_NETWORK" key, e.g.
  // { "MOBILE_NETWORK": { "MTN": [ { "ID":"01","PRODUCT":[...] } ], ... } }
  // — descend into it when present rather than treating MOBILE_NETWORK
  // itself as a network (which previously matched nothing and made
  // every sync silently return 0 plans regardless of credentials).
  const networksRoot = json.MOBILE_NETWORK && typeof json.MOBILE_NETWORK === "object" ? json.MOBILE_NETWORK : json

  for (const [networkKey, entries] of Object.entries(networksRoot)) {
    const network = NETWORK_LABEL[networkKey] ?? networkKey
    // Each network's value is an array of one object like
    // { "ID": "01", "PRODUCT": [ {...}, {...} ] } — flatten out the
    // PRODUCT arrays rather than treating the wrapper objects
    // themselves as plan entries.
    const wrappers = Array.isArray(entries) ? entries : Object.values(entries ?? {})
    const list = (wrappers as any[]).flatMap((w) =>
      w && typeof w === "object" && Array.isArray(w.PRODUCT) ? w.PRODUCT : Array.isArray(w) ? w : [w],
    )
    for (const entry of list as any[]) {
      if (!entry || typeof entry !== "object") continue
      // Real field names are PRODUCT_ID / PRODUCT_NAME / PRODUCT_AMOUNT
      // (see APIDatabundlePlansV2.asp sample response); the older
      // DataPlan/Plan/Price aliases are kept as fallbacks in case a
      // different ClubKonnect endpoint/version uses them.
      const planId = String(
        entry.PRODUCT_ID ?? entry.DataPlan ?? entry.dataplan ?? entry.plan_id ?? entry.PlanId ?? entry.id ?? "",
      )
      const label = String(
        entry.PRODUCT_NAME ?? entry.Plan ?? entry.PackageName ?? entry.plan ?? entry.name ?? entry.Description ?? "",
      )
      const priceRaw = entry.PRODUCT_AMOUNT ?? entry.Price ?? entry.price ?? entry.Amount ?? entry.amount
      const priceNaira = typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) : Number(priceRaw)
      if (planId && !Number.isNaN(priceNaira)) {
        out.push({ network, planId, label, priceNaira })
      }
    }
  }
  return out
}

export interface PlanSyncResult {
  fetched: number
  created: number
  updated: number
  skipped: number
}

export async function syncClubkonnectDataPlans(
  adminUserId: string,
  credentials: { userId?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.CLUBKONNECT_BASE_URL || "https://www.nellobytesystems.com"
  const userId = credentials.userId || process.env.CLUBKONNECT_USERID || ""

  const res = await fetchWithRetry(
    `${baseUrl}/APIDatabundlePlansV2.asp?UserID=${encodeURIComponent(userId)}`,
    { method: "GET" },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const json = await parseJsonOrThrow(res, "ClubKonnect", "APIDatabundlePlansV2")
  const plans = parsePlansResponse(json)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const plan of plans) {
    const costKobo = Math.round(plan.priceNaira * 100)
    if (costKobo <= 0) {
      skipped++
      continue
    }
    // Prefer a slug derived from the plan's real name/label
    // (PRODUCT_NAME etc, already parsed above) so plan_code is a
    // stable human-readable identifier. Only fall back to the raw
    // numeric PRODUCT_ID — prefixed so it's visually distinguishable
    // from a price — when ClubKonnect genuinely sent no usable label.
    const planCode = plan.label ? canonicalizedPlanCode(plan.label, plan.network, "data") : `ck-${plan.planId}`
    if (isNumericJunkPlanCode(planCode)) {
      skipped++
      continue
    }
    const existing = await findMappingByNaturalKey("data", plan.network, planCode, "clubkonnect", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType: "data",
        networkOrBiller: plan.network,
        planCode,
        providerKey: "clubkonnect",
        providerPlanId: plan.planId,
        providerCostKobo: costKobo,
        providerPlanLabel: plan.label || null,
      },
      adminUserId,
      nativeDB,
    )
    if (existing) updated++
    else created++
  }

  return { fetched: plans.length, created, updated, skipped }
}

// ClubKonnect Cable TV plan sync. APICableTVPackagesV2.asp is a
// genuine no-auth, list-everything catalog (confirmed live) shaped
// like { TV_ID: { DStv: [ { ID, PRODUCT: [ { PACKAGE_ID,
// PACKAGE_NAME, PACKAGE_AMOUNT, PRODUCT_DISCOUNT_AMOUNT, ... } ] } ],
// GOtv: [...], Startimes: [...], Showmax: [...] } }. Each package's
// PRODUCT_DISCOUNT_AMOUNT is ClubKonnect's own authoritative
// charge-to-you price (face value less their fixed provider-wide
// discount), so that — not PACKAGE_AMOUNT (the customer-facing face
// value) — is what gets stored as provider_cost_kobo, same convention
// every other provider's sync uses (the wholesale cost, not the
// retail price the platform will charge).
//
// TV_ID's top-level keys (DStv/GOtv/Startimes/Showmax) are normalized
// to the biller labels this codebase already uses elsewhere (DSTV,
// GOtv, StarTimes) via CABLE_BILLER_LABEL below — Showmax has no
// existing biller convention in this codebase (clubkonnect.ts's
// purchase() only handles cable via req.networkOrBiller.toLowerCase()
// as CableTV, so "Showmax" would work fine as a biller value too) and
// is passed through as-is; add it to the admin page's biller picker if
// you want it selectable there.
const CABLE_BILLER_LABEL: Record<string, string> = {
  DStv: "DSTV",
  GOtv: "GOtv",
  Startimes: "StarTimes",
  Showmax: "Showmax",
}

export async function syncClubkonnectCablePlans(
  adminUserId: string,
  credentials: { userId?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.CLUBKONNECT_BASE_URL || "https://www.nellobytesystems.com"
  const userId = credentials.userId || process.env.CLUBKONNECT_USERID || ""

  const res = await fetchWithRetry(
    `${baseUrl}/APICableTVPackagesV2.asp?UserID=${encodeURIComponent(userId)}`,
    { method: "GET" },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const json = await parseJsonOrThrow(res, "ClubKonnect", "APICableTVPackagesV2")
  const tvRoot = json?.TV_ID && typeof json.TV_ID === "object" ? json.TV_ID : {}

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const [tvKey, wrappers] of Object.entries(tvRoot)) {
    const biller = CABLE_BILLER_LABEL[tvKey] ?? tvKey
    const wrapperList = Array.isArray(wrappers) ? wrappers : [wrappers]
    const products = (wrapperList as any[]).flatMap((w) =>
      w && typeof w === "object" && Array.isArray(w.PRODUCT) ? w.PRODUCT : [],
    )

    for (const pkg of products) {
      fetched++
      const planId = String(pkg?.PACKAGE_ID ?? "")
      const costNaira = Number(pkg?.PRODUCT_DISCOUNT_AMOUNT ?? pkg?.PACKAGE_AMOUNT)
      const costKobo = Math.round(costNaira * 100)
      if (!planId || Number.isNaN(costKobo) || costKobo <= 0) {
        skipped++
        continue
      }
      const planCode = pkg?.PACKAGE_NAME
        ? canonicalizedPlanCode(String(pkg.PACKAGE_NAME), biller, "cable")
        : `ck-${planId}`
      if (isNumericJunkPlanCode(planCode)) {
        skipped++
        continue
      }
      const existing = await findMappingByNaturalKey("cable", biller, planCode, "clubkonnect", nativeDB)
      await upsertPlanMapping(
        {
          id: existing?.id,
          serviceType: "cable",
          networkOrBiller: biller,
          planCode,
          providerKey: "clubkonnect",
          providerPlanId: planId,
          providerCostKobo: costKobo,
          providerPlanLabel: pkg?.PACKAGE_NAME ?? null,
        },
        adminUserId,
        nativeDB,
      )
      if (existing) updated++
      else created++
    }
  }

  return { fetched, created, updated, skipped }
}

// ClubKonnect exam pin (WAEC/JAMB) price sync. APIWAECPackagesV2.asp
// and APIJAMBPackagesV2.asp are genuine no-auth catalog endpoints —
// confirmed live — shaped identically: { EXAM_TYPE: [ { PRODUCT_CODE,
// PRODUCT_DESCRIPTION, PRODUCT_AMOUNT } ] }. PRODUCT_AMOUNT is
// ClubKonnect's own price in naira (no separate discount field the
// way cable has — exam pins are sold at face value), so it maps
// straight to provider_cost_kobo like data bundle prices do.
//
// networkOrBiller is stored as "WAEC" / "JAMB" to match
// clubkonnect.ts's own convention (req.networkOrBiller selects which
// of the two underlying .asp endpoints purchase() calls), and
// planCode carries the PRODUCT_CODE (ExamType) value the adapter
// sends straight through as req.planCode.
//
// Note observed live: WAEC's packages endpoint returned real data
// even with a placeholder UserID; JAMB's returned an empty EXAM_TYPE
// array under the same placeholder — JAMB's catalog may be
// account-gated, so a real ClubKonnect UserID/APIKey configured on
// the Providers page is worth trying if this reports 0 fetched for
// JAMB specifically. The parsing logic is identical either way.
export async function syncClubkonnectExamPinPrices(
  adminUserId: string,
  credentials: { userId?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.CLUBKONNECT_BASE_URL || "https://www.nellobytesystems.com"
  const userId = credentials.userId || process.env.CLUBKONNECT_USERID || ""

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  const examEndpoints: { examBoard: string; path: string }[] = [
    { examBoard: "WAEC", path: "/APIWAECPackagesV2.asp" },
    { examBoard: "JAMB", path: "/APIJAMBPackagesV2.asp" },
  ]

  for (const { examBoard, path } of examEndpoints) {
    const res = await fetchWithRetry(
      `${baseUrl}${path}?UserID=${encodeURIComponent(userId)}`,
      { method: "GET" },
      { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
    )
    const json = await parseJsonOrThrow(res, "ClubKonnect", path)
    const products: any[] = Array.isArray(json?.EXAM_TYPE) ? json.EXAM_TYPE : []

    for (const product of products) {
      fetched++
      const examType = String(product?.PRODUCT_CODE ?? "")
      const costNaira = Number(product?.PRODUCT_AMOUNT)
      const costKobo = Math.round(costNaira * 100)
      if (!examType || Number.isNaN(costKobo) || costKobo <= 0 || isNumericJunkPlanCode(examType)) {
        skipped++
        continue
      }
      // plan_code must be OUR logical pin type ("registration" /
      // "result_checker"), not ClubKonnect's own PRODUCT_CODE — see
      // classifyExamPinType. Classify from PRODUCT_DESCRIPTION (falls
      // back to the code itself if description is missing); an
      // unrecognized product is skipped rather than stored under a
      // plan_code the buy page can never request.
      const examPinType = classifyExamPinType(String(product?.PRODUCT_DESCRIPTION ?? examType))
      if (!examPinType) {
        skipped++
        continue
      }
      const existing = await findMappingByNaturalKey("exam_pin", examBoard, examPinType, "clubkonnect", nativeDB)
      await upsertPlanMapping(
        {
          id: existing?.id,
          serviceType: "exam_pin",
          networkOrBiller: examBoard,
          planCode: examPinType,
          providerKey: "clubkonnect",
          providerPlanId: examType,
          providerCostKobo: costKobo,
          providerPlanLabel: product?.PRODUCT_DESCRIPTION ?? null,
        },
        adminUserId,
        nativeDB,
      )
      if (existing) updated++
      else created++
    }
  }

  return { fetched, created, updated, skipped }
}

// --- CheapDataHub ---------------------------------------------------
//
// Verified against live docs: https://www.cheapdatahub.ng/api_documentation/
//
// Only exam pins have a genuine JSON catalog endpoint —
// GET /api/v1/resellers/exam-pin/products/, authenticated with the
// same Bearer key cheapdatahub.ts uses for purchases. Confirmed from
// the docs page directly (not assumed): "GET
// /api/v1/resellers/exam-pin/products/ returns active exam PIN
// products and pricing."
//
// Data bundle and cable TV plan IDs are NOT behind a JSON API at all —
// CheapDataHub's own docs point integrators to a human-facing HTML
// page (https://www.cheapdatahub.ng/api/plan-ids/) with a searchable
// table (Network / Service / Plan Name / Plan ID / Price columns) and
// client-side filter dropdowns, not a REST endpoint. There is no
// documented GET that returns that table as JSON. Scraping the HTML
// table would work today but is fragile (breaks silently the moment
// their markup changes, with no contract to catch it) and isn't the
// pattern any other sync in this file uses, so — same as VTUGate
// cable and ClubKonnect electricity — data and cable plan IDs for
// CheapDataHub stay manually entered in Provider Plan Mappings for
// now. If CheapDataHub later publishes a real JSON endpoint for
// these, add syncCheapdatahubDataPlans / syncCheapdatahubCablePlans
// here following the same shape as syncCheapdatahubExamPinPrices
// below.
export async function syncCheapdatahubExamPinPrices(
  adminUserId: string,
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl =
    credentials.baseUrl || process.env.CHEAPDATAHUB_BASE_URL || "https://www.cheapdatahub.ng/api/v1/resellers"
  const apiKey = credentials.apiKey || process.env.CHEAPDATAHUB_API_KEY
  if (!apiKey) throw new Error("CheapDataHub API key not configured")

  const res = await fetchWithRetry(
    `${baseUrl}/exam-pin/products/`,
    { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const json = await parseJsonOrThrow(res, "CheapDataHub", "exam-pin/products")
  // Exact field names aren't pinned down by the public docs sample
  // (only the purchase response shape is shown there), so this reads
  // several plausible aliases per field — same defensive approach
  // cheapdatahub.ts's own extractDeliveredData already uses for this
  // provider, since its response field names generally aren't fixed
  // by public docs the way VTpass's are.
  const products: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const product of products) {
    fetched++
    const productId = String(product?.id ?? product?.product_id ?? "")
    const examBoard = String(product?.exam_name ?? product?.exam_type ?? product?.name ?? "").toUpperCase()
    const costNaira = Number(product?.price ?? product?.amount ?? product?.cost)
    const costKobo = Math.round(costNaira * 100)
    if (!productId || !examBoard || Number.isNaN(costKobo) || costKobo <= 0) {
      skipped++
      continue
    }
    const rawLabel = product?.description ?? product?.product_name ?? ""
    // plan_code must be OUR logical pin type ("registration" /
    // "result_checker") — see classifyExamPinType. Previously ran
    // through canonicalizedPlanCode (a size/validity-aware slugifier
    // meant for data/cable), which for exam_pin just falls through to
    // a cleaned slug of the raw label — never matching what the buy
    // page requests. Classify from whatever label text is available;
    // an unrecognized product is skipped rather than stored under a
    // plan_code that can never be looked up.
    const labelForClassification = String(rawLabel || examBoard)
    const examPinType = classifyExamPinType(labelForClassification)
    if (!examPinType) {
      skipped++
      continue
    }
    const existing = await findMappingByNaturalKey("exam_pin", examBoard, examPinType, "cheapdatahub", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType: "exam_pin",
        networkOrBiller: examBoard,
        planCode: examPinType,
        providerKey: "cheapdatahub",
        providerPlanId: productId,
        providerCostKobo: costKobo,
        providerPlanLabel: rawLabel || null,
      },
      adminUserId,
      nativeDB,
    )
    if (existing) updated++
    else created++
  }

  return { fetched, created, updated, skipped }
}

// --- VTUGate ------------------------------------------------------
//
// VTUGate has a genuine, authenticated JSON equivalent of the same
// idea: POST /api/v1/fetchdataplans returns { code, name, price,
// network_name, service_id, size_mb, validity_days } per plan — but
// unlike ClubKonnect's flat "?UserID=" no-auth lookup, this needs (1)
// a Bearer API key and (2) a service_id per network, which VTUGate
// only exposes via POST /api/v1/fetchallservices (service_type:
// "data") — so this is a two-step sync: discover each network's
// service_id, then fetch that network's plan catalog.
//
// "price" in fetchdataplans is already VTUGate's own charge to this
// account (their wholesale + your configured commission if any) in
// naira, same unit as ClubKonnect's Price field — so it maps to
// provider_cost_kobo the same way.
//
// code (not service_id) is what Buy Data actually needs alongside
// service_id per VTUGate's docs — both are stored: providerPlanId
// carries `${service_id}:${code}` so the purchase-time lookup has
// everything it needs from one mapping row without a second table.

async function vtugateFetchAllDataServiceIds(
  baseUrl: string,
  apiKey: string,
): Promise<Record<string, number>> {
  const res = await fetchWithRetry(
    `${baseUrl}/fetchallservices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${apiKey}`,
      },
      body: new URLSearchParams(),
    },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const json = await parseJsonOrThrow(res, "VTUGate", "fetchallservices")
  const rows: any[] = Array.isArray(json?.data) ? json.data : []
  const byNetwork: Record<string, number> = {}
  for (const row of rows) {
    if (row?.service_type === "data" && row?.network_name && row?.service_id) {
      // Prefer the first service_id seen per network — later duplicate
      // rows (e.g. a second provider's mapping for the same network)
      // are skipped rather than overwriting the first.
      const key = String(row.network_name).toUpperCase()
      if (!(key in byNetwork)) byNetwork[key] = Number(row.service_id)
    }
  }
  return byNetwork
}

export async function syncVtugateDataPlans(
  adminUserId: string,
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
  const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
  if (!apiKey) throw new Error("VTUGate API key not configured")

  const serviceIdsByNetwork = await vtugateFetchAllDataServiceIds(baseUrl, apiKey)

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const [network, serviceId] of Object.entries(serviceIdsByNetwork)) {
    const res = await fetchWithRetry(
      `${baseUrl}/fetchdataplans`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${apiKey}`,
        },
        body: new URLSearchParams({ service_id: String(serviceId) }),
      },
      { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
    )
    const json = await parseJsonOrThrow(res, "VTUGate", "fetchdataplans")
    const plans: any[] = Array.isArray(json?.data?.data_plans) ? json.data.data_plans : []
    fetched += plans.length

    for (const plan of plans) {
      const code = String(plan.code ?? "")
      const planServiceId = plan.service_id ? String(plan.service_id) : String(serviceId)
      const priceNaira = Number(plan.price)
      const costKobo = Math.round(priceNaira * 100)
      if (!code || Number.isNaN(costKobo) || costKobo <= 0) {
        skipped++
        continue
      }
      // VTUGate's fetchdataplans response returns a genuine plan_code
      // for most plans (e.g. "1gb-7day-cg"), but for some rows "code"
      // is actually just the plan's own price re-echoed as a string
      // (e.g. "1499.91", "20000.01") — not a stable identifier at all.
      // Storing that as plan_code creates a distinct (and meaningless)
      // pricing_rules row every time the price changes, floods the
      // buy-data plan picker with duplicate-looking numeric entries,
      // and can never be reliably re-matched across syncs. A plan_code
      // that parses as a plain number (optionally with a decimal) is
      // never legitimate — every real VTUGate code seen in practice is
      // alphanumeric with letters/dashes — so reject it here rather
      // than downstream, before it ever reaches provider_plan_mappings.
      if (isNumericJunkPlanCode(code)) {
        skipped++
        continue
      }
      const providerPlanId = `${planServiceId}:${code}`
      // VTUGate's own "code" (e.g. "1gb-7day-cg") is already slug-like,
      // but is still just THEIR wording — run it through the same
      // canonicalizer as every other provider so "1gb-7day-cg" from
      // VTUGate and "1GB/7Days/CG" from another provider land on the
      // same plan_code, instead of VTUGate's raw code becoming its own
      // permanent one-provider-only plan entry. Prefer plan.name when
      // present (fuller text to parse from); fall back to code itself.
      const planCode = canonicalizedPlanCode(plan.name || code, network, "data")
      const existing = await findMappingByNaturalKey("data", network, planCode, "vtugate", nativeDB)
      await upsertPlanMapping(
        {
          id: existing?.id,
          serviceType: "data",
          networkOrBiller: network,
          planCode,
          providerKey: "vtugate",
          providerPlanId,
          providerCostKobo: costKobo,
          providerPlanLabel: plan.name ?? null,
        },
        adminUserId,
        nativeDB,
      )
      if (existing) updated++
      else created++
    }
  }

  return { fetched, created, updated, skipped }
}

// VTUGate exam pin price sync — uses fetchallservices to discover
// every education row (service_id, product_code, edu_type), then
// geteducationtypeprice per row for the authoritative per-pin price
// (already includes this account's configured markup, per VTUGate's
// docs). No smartcard/customer input needed — this is a genuine
// list-everything sync, unlike cable below.
//
// networkOrBiller must be the real exam board ("WAEC"/"NECO"/"JAMB"/
// "NABTEB") — that's what the customer-facing Buy Exam PIN page sends
// as examBody and what getLivePlanProviderOptions matches on — and
// planCode must be OUR logical pin type ("registration" /
// "result_checker") — see classifyExamPinType. Previously this stored
// VTUGate's raw product_code in BOTH fields, which meant a synced row
// could never match what the buy page actually requests, regardless
// of how many times reconcile ran.
//
// providerPlanId still carries VTUGate's numeric service_id, which is
// what vtuRouter.ts's EXAM_PIN_NETWORK_OVERRIDE_PROVIDERS swaps back
// into req.networkOrBiller right before calling the adapter (VTUGate's
// exam_pin purchase path has no separate plan-id field — it reads the
// product/service identifier off networkOrBiller instead of planCode).
// That override is unaffected by fixing planCode/networkOrBiller here.
export async function syncVtugateExamPinPrices(
  adminUserId: string,
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
  const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
  if (!apiKey) throw new Error("VTUGate API key not configured")

  const allServicesRes = await fetchWithRetry(
    `${baseUrl}/fetchallservices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${apiKey}`,
      },
      body: new URLSearchParams(),
    },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const allServicesJson = await parseJsonOrThrow(allServicesRes, "VTUGate", "fetchallservices")
  const eduRows: any[] = Array.isArray(allServicesJson?.data)
    ? allServicesJson.data.filter((row: any) => row?.service_type === "education" && row?.product_code && row?.service_id)
    : []

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of eduRows) {
    fetched++
    const productCode = String(row.product_code)
    const serviceId = row.service_id

    const priceRes = await fetchWithRetry(
      `${baseUrl}/geteducationtypeprice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${apiKey}`,
        },
        body: new URLSearchParams({ service_id: String(serviceId) }),
      },
      { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
    )
    const priceJson = await parseJsonOrThrow(priceRes, "VTUGate", "geteducationtypeprice")
    const priceNaira = Number(priceJson?.data?.price)
    const costKobo = Math.round(priceNaira * 100)
    if (!productCode || Number.isNaN(costKobo) || costKobo <= 0) {
      skipped++
      continue
    }

    // Derive the real exam board and pin type from whatever text this
    // row gives us — product_code itself (e.g. "waec-de",
    // "neco-result-checker") plus service_name/edu_type as fallbacks.
    // Both must resolve or this row can never be looked up by the buy
    // page, so an unrecognized row is skipped rather than stored under
    // a networkOrBiller/planCode combination nothing will ever request.
    const classificationText = `${productCode} ${row.service_name ?? ""} ${row.edu_type ?? ""}`
    const examBoard = EXAM_BOARDS.find((board) => classificationText.toUpperCase().includes(board))
    const examPinType = classifyExamPinType(classificationText)
    if (!examBoard || !examPinType) {
      skipped++
      continue
    }

    const providerPlanId = String(serviceId)
    const existing = await findMappingByNaturalKey("exam_pin", examBoard, examPinType, "vtugate", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType: "exam_pin",
        networkOrBiller: examBoard,
        planCode: examPinType,
        providerKey: "vtugate",
        providerPlanId,
        providerCostKobo: costKobo,
        providerPlanLabel: row.service_name ?? row.edu_type ?? null,
      },
      adminUserId,
      nativeDB,
    )
    if (existing) updated++
    else created++
  }

  return { fetched, created, updated, skipped }
}

// VTUGate cable plan sync — admin-triggered, per-smartcard. Unlike data
// and exam_pin, VTUGate has no list-all-cable-plans endpoint; the only
// way to see a biller's plan catalog is to Verify a real smartcard
// number against it (per /verifycabletv docs). This is deliberately
// NOT auto-run against a fake/placeholder smartcard — that would be a
// live verify call against nothing real, and could misbehave or get
// flagged by VTUGate. Instead the admin supplies one real smartcard
// they own/trust per biller, and this captures that biller's full
// plan list + prices (already including markup) in one call.
export async function syncVtugateCablePlans(
  adminUserId: string,
  params: { serviceId: number | string; smartcardNumber: string; biller: string; phone: string },
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
  const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
  if (!apiKey) throw new Error("VTUGate API key not configured")

  const res = await fetchWithRetry(
    `${baseUrl}/verifycabletv`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${apiKey}`,
      },
      body: new URLSearchParams({
        service_id: String(params.serviceId),
        phone: params.phone,
        smartcard_number: params.smartcardNumber,
      }),
    },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const json = await parseJsonOrThrow(res, "VTUGate", "verifycabletv")
  if (!json?.status || !json?.data?.provider_status) {
    throw new Error(json?.message ?? "VTUGate smartcard verification failed")
  }
  const plans: any[] = Array.isArray(json?.data?.cable_plans) ? json.data.cable_plans : []

  let fetched = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (const plan of plans) {
    fetched++
    const code = String(plan.code ?? "")
    const priceNaira = Number(plan.price)
    const costKobo = Math.round(priceNaira * 100)
    if (!code || Number.isNaN(costKobo) || costKobo <= 0 || isNumericJunkPlanCode(code)) {
      skipped++
      continue
    }
    const planServiceId = plan.service_id ? String(plan.service_id) : String(params.serviceId)
    const providerPlanId = `${planServiceId}:${code}`
    const planCode = canonicalizedPlanCode(plan.name || code, params.biller, "cable")
    const existing = await findMappingByNaturalKey("cable", params.biller, planCode, "vtugate", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType: "cable",
        networkOrBiller: params.biller,
        planCode,
        providerKey: "vtugate",
        providerPlanId,
        providerCostKobo: costKobo,
        providerPlanLabel: plan.name ?? null,
      },
      adminUserId,
      nativeDB,
    )
    if (existing) updated++
    else created++
  }

  return { fetched, created, updated, skipped }
}

// --- PairGate -------------------------------------------------------
//
// Verified against live docs: https://pairgate.com/developers/data-plans
// and https://pairgate.com/developers/cable-plans (both require the
// Bearer API key already stored on the Providers page).
//
// Data plans: PairGate requires BOTH provider_id (network slug) and
// plan_type (a category label — CG, CG_LITE, SME, GIFTING, AWOOF) as
// query params on GET /data-plans, and doesn't expose a single
// "everything" endpoint — so this is a two-step sync, same shape as
// VTUGate's: first call GET /data-plans/categories to discover every
// (provider, plan_type) combination that actually exists, then fetch
// each one in turn. Response is { data: { "<ProviderName>": [
// { plan_id, name, price, duration } ] } } — grouped by provider
// display name (e.g. "MTN"), not slug, so NETWORK_LABEL normalizes
// that against the same "MTN"/"Glo"/"Airtel"/"9mobile" convention
// every other provider's mappings use.
//
// Cable plans: simpler — one GET /cable-plans?provider_id=<slug> per
// billers, response shaped the same way: { data: { "DSTV": [
// { plan_id, name, price } ] } }.
//
// Both endpoints return `price` already in naira (not kobo), same
// unit ClubKonnect/VTUGate use, so the *100 conversion below matches.

const PAIRGATE_CABLE_PROVIDER_SLUGS: Record<string, string> = {
  DSTV: "dstv",
  GOtv: "gotv",
  StarTimes: "startimes",
}

// Both Pairgate sync loops below fire one HTTP call per category/slug
// in a tight loop with zero pacing between iterations. fetchWithRetry
// already backs off *within* a single call on a 429, but that doesn't
// help here — Pairgate's limit is per-second across ALL calls, so a
// data sync with a dozen-plus categories can trip it repeatedly before
// any individual call's own retry logic matters, as seen live ("Please
// wait 1 seconds before retrying" firing on both Data and Cable syncs
// back to back). A small fixed delay between iterations keeps every
// request loop comfortably under a 1-request-per-second ceiling
// without needing to know Pairgate's exact limit.
function pairgateThrottleDelay() {
  return new Promise((resolve) => setTimeout(resolve, 1500))
}

// Cable billers as PairGate might return their provider_name (casing
// varies by doc example — "DSTV" in the docs, but treat this as
// case-insensitive-ish by normalizing both sides at lookup time)
// against our own NETWORKS_OR_BILLERS convention ("DSTV", "GOtv",
// "StarTimes"). Separate from NETWORK_LABEL, which is mobile-network
// only (MTN/Glo/Airtel/9mobile) and would silently pass cable billers
// through unmapped/mis-cased if reused here.
const PAIRGATE_CABLE_BILLER_LABEL: Record<string, string> = {
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "StarTimes",
}

interface PairgatePlanEntry {
  plan_id?: string | number
  name?: string
  price?: number | string
  duration?: number | string
}

function parsePairgatePlansByProvider(json: any): Record<string, PairgatePlanEntry[]> {
  const data = json?.data
  if (!data || typeof data !== "object") return {}
  const out: Record<string, PairgatePlanEntry[]> = {}
  for (const [providerName, entries] of Object.entries(data)) {
    out[providerName] = Array.isArray(entries) ? (entries as PairgatePlanEntry[]) : []
  }
  return out
}

async function pairgateUpsertPlans(
  serviceType: "data" | "cable",
  providerName: string,
  entries: PairgatePlanEntry[],
  adminUserId: string,
  nativeDB: any,
  counts: { created: number; updated: number; skipped: number },
) {
  const network =
    serviceType === "cable"
      ? PAIRGATE_CABLE_BILLER_LABEL[providerName.toLowerCase()] ?? providerName
      : NETWORK_LABEL[providerName] ?? providerName
  for (const entry of entries) {
    const planId = String(entry.plan_id ?? "")
    const priceRaw = entry.price
    const priceNaira = typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) : Number(priceRaw)
    const costKobo = Math.round(priceNaira * 100)
    if (!planId || Number.isNaN(costKobo) || costKobo <= 0) {
      counts.skipped++
      continue
    }
    // Prefer a slug derived from entry.name (Pairgate's real plan
    // label, previously only stored cosmetically as
    // providerPlanLabel) so plan_code is a stable human-readable
    // identifier instead of the raw numeric plan_id or price. Only
    // fall back to the prefixed numeric ID if Pairgate sent no name.
    //
    // Pairgate's /data-plans response carries validity as a SEPARATE
    // `duration` field (see docs excerpt above the interface) — it is
    // NOT embedded in `entry.name` for many plans (e.g. "110MB",
    // "150MB (AWOOF)", "1GB Social Plan Platforms" all omit it). The
    // canonical-key parser only reads the text it's given, so passing
    // entry.name alone silently drops validity for every such plan —
    // these then fail confident parsing downstream (no validity found)
    // and can never merge with the same real plan synced from another
    // provider that does spell out the day count. Appending "<N>days"
    // when Pairgate supplies a duration (and only then — never invent
    // one) lets the existing parser pick it up exactly as if the
    // provider had written it inline, with no change needed to
    // planNormalization.ts itself.
    const durationNum =
      typeof entry.duration === "string" ? parseFloat(entry.duration) : entry.duration
    const nameWithDuration =
      entry.name && typeof durationNum === "number" && !Number.isNaN(durationNum) && durationNum > 0
        ? `${entry.name} ${durationNum}days`
        : entry.name
    const planCode = nameWithDuration ? canonicalizedPlanCode(nameWithDuration, network, serviceType) : `pg-${planId}`
    if (isNumericJunkPlanCode(planCode)) {
      counts.skipped++
      continue
    }
    // Match by Pairgate's own plan_id FIRST, not by our plan_code —
    // plan_code is derived text that legitimately changes when the
    // normalizer improves (exactly what happened here: "110mb" ->
    // "110mb-1d" once duration parsing was added). Matching on
    // plan_code alone would never find that old row and would create
    // an orphaned duplicate instead of updating it in place — which
    // is exactly the stale-row bug this fixes. Falls back to the
    // natural-key lookup only for a plan_id genuinely new to us.
    const existing =
      (await findMappingByProviderPlanId(serviceType, network, "pairgate", planId, nativeDB)) ??
      (await findMappingByNaturalKey(serviceType, network, planCode, "pairgate", nativeDB))
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType,
        networkOrBiller: network,
        planCode,
        providerKey: "pairgate",
        providerPlanId: planId,
        providerCostKobo: costKobo,
        // Store the duration-augmented label, not just entry.name, so
        // provider_plan_label stays a faithful record of what actually
        // produced planCode — useful for debugging/re-running the
        // migration later without needing to re-fetch from Pairgate.
        providerPlanLabel: nameWithDuration ?? null,
      },
      adminUserId,
      nativeDB,
    )
    if (existing) counts.updated++
    else counts.created++
  }
}

export async function syncPairgateDataPlans(
  adminUserId: string,
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://pairgate.com/api/v1"
  const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY
  if (!apiKey) throw new Error("Pairgate API key not configured")

  const headers = { Authorization: `Bearer ${apiKey}`, "Cache-Control": "no-cache" }

  // Discover every (provider_id, plan_type) pair that actually exists,
  // rather than hardcoding the plan_type list — categories vary per
  // network and PairGate may add new ones without notice.
  const categoriesRes = await fetchWithRetry(
    `${baseUrl}/data-plans/categories`,
    { method: "GET", headers },
    // retries bumped to 4 for Pairgate specifically: fetchWithRetry
    // now honors their Retry-After header when present, but that only
    // helps if there's attempt budget left to use it — 2 retries left
    // almost no room after a 429, which is exactly what kept failing
    // live even with inter-request pacing in place.
    { retries: 4, timeoutMs: 15_000, retryUnsafe: false },
  )
  const categoriesJson = await parseJsonOrThrow(categoriesRes, "Pairgate", "data-plans/categories")
  const categories: { provider_name?: string; plan_type?: string }[] = Array.isArray(categoriesJson?.data)
    ? categoriesJson.data
    : []

  let fetched = 0
  const counts = { created: 0, updated: 0, skipped: 0 }

  // Pace even the first plans call after the categories call — both
  // count against the same per-second limit, and firing the loop's
  // first request immediately after categories returns is exactly how
  // a 429 can happen before any inter-iteration delay gets a chance to
  // matter.
  await pairgateThrottleDelay()

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    const providerName = cat.provider_name
    const planType = cat.plan_type
    if (!providerName || !planType) continue
    const providerSlug = providerName.toLowerCase()

    const plansRes = await fetchWithRetry(
      `${baseUrl}/data-plans?provider_id=${encodeURIComponent(providerSlug)}&plan_type=${encodeURIComponent(planType)}`,
      { method: "GET", headers },
      { retries: 4, timeoutMs: 15_000, retryUnsafe: false },
    )
    const plansJson = await parseJsonOrThrow(plansRes, "Pairgate", "data-plans")
    const byProvider = parsePairgatePlansByProvider(plansJson)

    for (const [returnedProviderName, entries] of Object.entries(byProvider)) {
      fetched += entries.length
      await pairgateUpsertPlans("data", returnedProviderName, entries, adminUserId, nativeDB, counts)
    }

    if (i < categories.length - 1) await pairgateThrottleDelay()
  }

  return { fetched, ...counts }
}

export async function syncPairgateCablePlans(
  adminUserId: string,
  credentials: { apiKey?: string; baseUrl?: string } = {},
  nativeDB?: any,
): Promise<PlanSyncResult> {
  const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://pairgate.com/api/v1"
  const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY
  if (!apiKey) throw new Error("Pairgate API key not configured")

  const headers = { Authorization: `Bearer ${apiKey}`, "Cache-Control": "no-cache" }

  let fetched = 0
  const counts = { created: 0, updated: 0, skipped: 0 }

  const slugEntries = Object.entries(PAIRGATE_CABLE_PROVIDER_SLUGS)
  for (let i = 0; i < slugEntries.length; i++) {
    const [, slug] = slugEntries[i]
    const res = await fetchWithRetry(
      `${baseUrl}/cable-plans?provider_id=${encodeURIComponent(slug)}`,
      { method: "GET", headers },
      { retries: 4, timeoutMs: 15_000, retryUnsafe: false },
    )
    const json = await parseJsonOrThrow(res, "Pairgate", "cable-plans")
    const byProvider = parsePairgatePlansByProvider(json)

    for (const [returnedProviderName, entries] of Object.entries(byProvider)) {
      fetched += entries.length
      await pairgateUpsertPlans("cable", returnedProviderName, entries, adminUserId, nativeDB, counts)
    }

    if (i < slugEntries.length - 1) await pairgateThrottleDelay()
  }

  return { fetched, ...counts }
}
