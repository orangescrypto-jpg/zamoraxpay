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
// genuine per-plan wholesale price list). Airtime/Cable/Electricity
// pricing on ClubKonnect is a flat percentage discount off face value,
// not a per-item plan catalog, so it doesn't fit this same "sync a
// list of plan rows" shape — those stay configured the normal way
// (pricing_rules), same as VTUGate's non-plan-based services.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import { upsertPlanMapping, findMappingByNaturalKey } from "@/src/services/providerPlanMappings"

const NETWORK_LABEL: Record<string, string> = {
  MTN: "MTN",
  Glo: "Glo",
  Airtel: "Airtel",
  "9mobile": "9mobile",
  t2mobile: "9mobile",
  m_9mobile: "9mobile",
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
  const json = await res.json()
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
    const existing = await findMappingByNaturalKey("data", plan.network, plan.planId, "clubkonnect", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType: "data",
        networkOrBiller: plan.network,
        planCode: plan.planId,
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
  const json = await res.json()
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
    const json = await res.json()
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
      const providerPlanId = `${planServiceId}:${code}`
      const existing = await findMappingByNaturalKey("data", network, code, "vtugate", nativeDB)
      await upsertPlanMapping(
        {
          id: existing?.id,
          serviceType: "data",
          networkOrBiller: network,
          planCode: code,
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

// Cable billers as PairGate might return their provider_name (casing
// varies by doc example — "DSTV" in the docs, but treat this as
// case-insensitive-ish by normalizing both sides at lookup time)
// against our own NETWORKS_OR_BILLERS convention ("DSTV", "GOtv",
// "StarTimes"). Separate from NETWORK_LABEL, which is mobile-network
// only (MTN/Glo/Airtel/9mobile) and would silently pass cable billers
// through unmapped/mis-cased if reused here.
const CABLE_BILLER_LABEL: Record<string, string> = {
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "StarTimes",
}

interface PairgatePlanEntry {
  plan_id?: string | number
  name?: string
  price?: number | string
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
      ? CABLE_BILLER_LABEL[providerName.toLowerCase()] ?? providerName
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
    const existing = await findMappingByNaturalKey(serviceType, network, planId, "pairgate", nativeDB)
    await upsertPlanMapping(
      {
        id: existing?.id,
        serviceType,
        networkOrBiller: network,
        planCode: planId,
        providerKey: "pairgate",
        providerPlanId: planId,
        providerCostKobo: costKobo,
        providerPlanLabel: entry.name ?? null,
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
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  const categoriesJson = await categoriesRes.json()
  const categories: { provider_name?: string; plan_type?: string }[] = Array.isArray(categoriesJson?.data)
    ? categoriesJson.data
    : []

  let fetched = 0
  const counts = { created: 0, updated: 0, skipped: 0 }

  for (const cat of categories) {
    const providerName = cat.provider_name
    const planType = cat.plan_type
    if (!providerName || !planType) continue
    const providerSlug = providerName.toLowerCase()

    const plansRes = await fetchWithRetry(
      `${baseUrl}/data-plans?provider_id=${encodeURIComponent(providerSlug)}&plan_type=${encodeURIComponent(planType)}`,
      { method: "GET", headers },
      { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
    )
    const plansJson = await plansRes.json()
    const byProvider = parsePairgatePlansByProvider(plansJson)

    for (const [returnedProviderName, entries] of Object.entries(byProvider)) {
      fetched += entries.length
      await pairgateUpsertPlans("data", returnedProviderName, entries, adminUserId, nativeDB, counts)
    }
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

  for (const [, slug] of Object.entries(PAIRGATE_CABLE_PROVIDER_SLUGS)) {
    const res = await fetchWithRetry(
      `${baseUrl}/cable-plans?provider_id=${encodeURIComponent(slug)}`,
      { method: "GET", headers },
      { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
    )
    const json = await res.json()
    const byProvider = parsePairgatePlansByProvider(json)

    for (const [returnedProviderName, entries] of Object.entries(byProvider)) {
      fetched += entries.length
      await pairgateUpsertPlans("cable", returnedProviderName, entries, adminUserId, nativeDB, counts)
    }
  }

  return { fetched, ...counts }
}
