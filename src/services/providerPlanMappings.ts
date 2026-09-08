// src/services/providerPlanMappings.ts
// Service abstraction layer — provider plan mappings.
//
// This is what makes "I set the same 200MB/1-day plan on both
// Pairgate and CheapDataHub at different prices — use the cheaper
// one" work. A pricing_rules row (service_type + network_or_biller +
// plan_code) is OUR plan as the customer sees it; this table records,
// for each VTU provider that also offers that exact plan, what THAT
// provider calls it (their plan_id/variation_id) and what it costs us
// there. The router (vtuRouter.ts) reads this to try the cheapest
// enabled provider first for plan-coded purchases, instead of a flat
// priority order.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"

export interface ProviderPlanMapping {
  id: string
  serviceType: VtuServiceType
  networkOrBiller: string
  planCode: string
  providerKey: string
  providerPlanId: string
  providerCostKobo: number
  providerPlanLabel: string | null
  isActive: boolean
}

// All provider-side options for one of our plans, cheapest first.
// Used by the router at purchase time.
export async function getPlanProviderOptions(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string,
  nativeDB?: any,
): Promise<ProviderPlanMapping[]> {
  const result = await d1Query(
    `SELECT * FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND plan_code = ? AND is_active = 1
     ORDER BY provider_cost_kobo ASC`,
    [serviceType, networkOrBiller, planCode],
    nativeDB,
  )
  return (result.results ?? []).map(rowToMapping)
}

// Full admin listing (optionally filtered), including inactive rows,
// for the admin plan-mapping management screen.
export async function listPlanMappings(
  filters: { serviceType?: VtuServiceType; networkOrBiller?: string; planCode?: string } = {},
  nativeDB?: any,
): Promise<ProviderPlanMapping[]> {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.serviceType) {
    clauses.push("service_type = ?")
    params.push(filters.serviceType)
  }
  if (filters.networkOrBiller) {
    clauses.push("network_or_biller = ?")
    params.push(filters.networkOrBiller)
  }
  if (filters.planCode) {
    clauses.push("plan_code = ?")
    params.push(filters.planCode)
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  const result = await d1Query(
    `SELECT * FROM provider_plan_mappings ${where}
     ORDER BY service_type, network_or_biller, plan_code, provider_cost_kobo ASC`,
    params,
    nativeDB,
  )
  return (result.results ?? []).map(rowToMapping)
}

export async function upsertPlanMapping(
  params: {
    id?: string
    serviceType: VtuServiceType
    networkOrBiller: string
    planCode: string
    providerKey: string
    providerPlanId: string
    providerCostKobo: number
    providerPlanLabel?: string | null
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  if (params.id) {
    await d1Query(
      `UPDATE provider_plan_mappings SET
        service_type = ?, network_or_biller = ?, plan_code = ?,
        provider_key = ?, provider_plan_id = ?, provider_cost_kobo = ?,
        provider_plan_label = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        params.serviceType,
        params.networkOrBiller,
        params.planCode,
        params.providerKey,
        params.providerPlanId,
        params.providerCostKobo,
        params.providerPlanLabel ?? null,
        adminUserId,
        params.id,
      ],
      nativeDB,
    )
    return
  }

  // UNIQUE(service_type, network_or_biller, plan_code, provider_key)
  // means re-mapping the same plan+provider is an upsert, not a
  // duplicate row — e.g. re-syncing provider plan IDs after they
  // change theirs.
  await d1Query(
    `INSERT INTO provider_plan_mappings
      (id, service_type, network_or_biller, plan_code, provider_key, provider_plan_id, provider_cost_kobo, provider_plan_label, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_type, network_or_biller, plan_code, provider_key)
     DO UPDATE SET
       provider_plan_id = excluded.provider_plan_id,
       provider_cost_kobo = excluded.provider_cost_kobo,
       provider_plan_label = excluded.provider_plan_label,
       is_active = 1,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
    [
      randomUUID(),
      params.serviceType,
      params.networkOrBiller,
      params.planCode,
      params.providerKey,
      params.providerPlanId,
      params.providerCostKobo,
      params.providerPlanLabel ?? null,
      adminUserId,
    ],
    nativeDB,
  )
}

export async function setPlanMappingActive(id: string, isActive: boolean, nativeDB?: any): Promise<void> {
  await d1Query(
    "UPDATE provider_plan_mappings SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    [isActive ? 1 : 0, id],
    nativeDB,
  )
}

export async function deletePlanMapping(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM provider_plan_mappings WHERE id = ?", [id], nativeDB)
}

function rowToMapping(row: any): ProviderPlanMapping {
  return {
    id: row.id,
    serviceType: row.service_type,
    networkOrBiller: row.network_or_biller,
    planCode: row.plan_code,
    providerKey: row.provider_key,
    providerPlanId: row.provider_plan_id,
    providerCostKobo: row.provider_cost_kobo,
    providerPlanLabel: row.provider_plan_label,
    isActive: row.is_active === 1,
  }
}
