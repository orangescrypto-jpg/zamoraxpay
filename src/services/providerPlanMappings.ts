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
import type { VtuServiceType, VtuProviderKey } from "@/src/types"
import { canonicalPlanKey, normalizeNetworkOrBiller } from "@/src/services/planNormalization"

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
  // Normalize the lookup key the same way writes are normalized, so a
  // caller passing through an old un-normalized plan_code (e.g. from a
  // stale pricing_rules row not yet migrated, or a caller built before
  // this normalization existed) still matches what sync/admin writes
  // actually stored, instead of silently finding zero options and
  // falling through to the priority-order fallback.
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const normalizedPlanCode = canonicalPlanKey(planCode, normalizedNetwork, serviceType).planCode
  const result = await d1Query(
    `SELECT * FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND plan_code = ? AND is_active = 1
     ORDER BY provider_cost_kobo ASC`,
    [serviceType, normalizedNetwork, normalizedPlanCode],
    nativeDB,
  )
  return (result.results ?? []).map(rowToMapping)
}

// True if this exact plan_code has at least one provider mapping that
// is both is_active AND currently enabled in vtu_provider_configs —
// i.e. the router would actually have something to try for it right
// now. Used pre-debit by purchaseFlow to detect a dead plan BEFORE
// charging the customer, not after a failed router attempt — so a
// cross-variant fallback offer can be made without ever needing to
// debit-then-refund-then-redebit.
export async function hasLiveRoute(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string,
  nativeDB?: any,
): Promise<boolean> {
  const options = await getPlanProviderOptions(serviceType, networkOrBiller, planCode, nativeDB)
  if (options.length === 0) return true // unmapped plan — no liveness signal, same "nothing to check" treatment as listPlans
  const { getActiveVtuProviders } = await import("@/src/services/config")
  const activeProviders = await getActiveVtuProviders(serviceType, nativeDB)
  const activeKeys = new Set<string>(activeProviders.map((p) => p.providerKey))
  return options.some((o) => activeKeys.has(o.providerKey as VtuProviderKey))
}

// Same as getPlanProviderOptions, but filtered to only mappings whose
// provider is currently enabled in vtu_provider_configs — i.e. the
// exact candidate list the router would actually try right now, cheapest
// first. This is the shared source pricingReconcile.ts prices from and
// vtuRouter.ts routes with, so toggling a provider off changes price and
// routing together, never one without the other.
export async function getLivePlanProviderOptions(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string,
  nativeDB?: any,
): Promise<ProviderPlanMapping[]> {
  const options = await getPlanProviderOptions(serviceType, networkOrBiller, planCode, nativeDB)
  if (options.length === 0) return []
  const { getActiveVtuProviders } = await import("@/src/services/config")
  const activeProviders = await getActiveVtuProviders(serviceType, nativeDB)
  const activeKeys = new Set<string>(activeProviders.map((p) => p.providerKey))
  // options already arrives cheapest-first from getPlanProviderOptions;
  // filtering preserves that order.
  return options.filter((o) => activeKeys.has(o.providerKey as VtuProviderKey))
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

// Look up a mapping by its natural key (the same 4 columns the
// UNIQUE constraint covers) — used to detect, before writing, whether
// a save/upload is about to overwrite an existing row rather than
// create a new one, so the UI can tell the admin which happened.
export async function findMappingByNaturalKey(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string,
  providerKey: string,
  nativeDB?: any,
): Promise<ProviderPlanMapping | null> {
  // Callers (all sync functions) now pass an already-canonicalized
  // planCode from canonicalizedPlanCode(), but normalize again here
  // too — cheap, and guards any caller that isn't updated yet.
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const normalizedPlanCode = canonicalPlanKey(planCode, normalizedNetwork, serviceType).planCode
  const result = await d1Query(
    `SELECT * FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND plan_code = ? AND provider_key = ?`,
    [serviceType, normalizedNetwork, normalizedPlanCode, providerKey],
    nativeDB,
  )
  const row = (result.results ?? [])[0]
  return row ? rowToMapping(row) : null
}

// Look up a mapping by the PROVIDER's own stable identifier instead
// of our plan_code. Needed because plan_code is derived text that can
// legitimately change under a sync fix (e.g. the same Pairgate plan
// re-canonicalizing from "110mb" to "110mb-1d" once validity parsing
// improved) — findMappingByNaturalKey alone would never find that old
// row (different plan_code = no UNIQUE-constraint match = no ON
// CONFLICT), so a normalizer improvement silently creates a second,
// orphaned row instead of updating the first. Matching on
// (service_type, network_or_biller, provider_key, provider_plan_id)
// survives a plan_code change because the provider's own ID for that
// plan doesn't change just because our label of it got better.
export async function findMappingByProviderPlanId(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  providerKey: string,
  providerPlanId: string,
  nativeDB?: any,
): Promise<ProviderPlanMapping | null> {
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const result = await d1Query(
    `SELECT * FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND provider_key = ? AND provider_plan_id = ?`,
    [serviceType, normalizedNetwork, providerKey, providerPlanId],
    nativeDB,
  )
  const row = (result.results ?? [])[0]
  return row ? rowToMapping(row) : null
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
  // Normalize on every write path — not just sync. A human typing a
  // plan code by hand in the admin UI or a bulk CSV upload is just as
  // likely to write "MTN 230MB 1 Day" as a sync job is to receive it
  // from a provider, so both must land on the same canonical code or
  // the manual entry becomes its own invisible duplicate plan.
  // providerPlanLabel (the original as-given text) is preserved
  // unchanged for admin display — only plan_code and network_or_biller
  // get canonicalized.
  params = {
    ...params,
    networkOrBiller: normalizeNetworkOrBiller(params.networkOrBiller),
    planCode: canonicalPlanKey(params.planCode, params.networkOrBiller, params.serviceType).planCode,
  }

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
