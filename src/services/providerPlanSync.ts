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

  for (const [networkKey, entries] of Object.entries(json)) {
    const network = NETWORK_LABEL[networkKey] ?? networkKey
    const list = Array.isArray(entries) ? entries : Object.values(entries ?? {})
    for (const entry of list as any[]) {
      if (!entry || typeof entry !== "object") continue
      const planId = String(entry.DataPlan ?? entry.dataplan ?? entry.plan_id ?? entry.PlanId ?? entry.id ?? "")
      const label = String(entry.Plan ?? entry.PackageName ?? entry.plan ?? entry.name ?? entry.Description ?? "")
      const priceRaw = entry.Price ?? entry.price ?? entry.Amount ?? entry.amount
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
