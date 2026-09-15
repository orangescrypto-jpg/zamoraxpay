// src/services/pricingReconcile.ts
// Service abstraction layer — pricing reconciliation.
//
// This is the piece that keeps provider_plan_mappings (synced costs)
// and pricing_rules (what the customer pays) in agreement, without an
// admin manually typing a price every time a plan is synced or a
// general fee changes.
//
// Call reconcilePricingFromMappings(serviceType) after:
//   1. Any provider sync for that service_type finishes (a new plan
//      appeared, or an existing plan's cost changed).
//   2. An admin saves a pricing_policies row for that service_type
//      (the general fee itself changed).
//
// What it does, per distinct (network_or_biller, plan_code) under
// that service_type:
//   - Finds every LIVE provider_plan_mappings row for that plan —
//     "live" meaning both is_active on the mapping AND the provider is
//     currently enabled in vtu_provider_configs (see
//     getLivePlanProviderOptions in providerPlanMappings.ts, cheapest-
//     first) — the exact same source the VTU router uses at purchase
//     time, so pricing and routing always agree on who's actually in
//     the running, and toggling a provider off takes effect on both at
//     once.
//   - Prices off selectPricingBasis(options) — NOT the cheapest.
//     1 live provider: that provider's cost. 2+: one below the
//     highest (the priciest with exactly 2 providers; the second-
//     priciest with 3+). This bounds the loss on a fallback order
//     instead of pricing at the cheapest and eating the full gap.
//   - If no pricing_rules row exists yet for that plan, creates one,
//     auto_priced = 1, priced from the basis cost + the service's
//     policy fees.
//   - If a pricing_rules row exists and auto_priced = 1, recalculates
//     retail/wholesale/convenience from the CURRENT basis cost +
//     CURRENT policy fees and overwrites it.
//   - If a pricing_rules row exists and auto_priced = 0 (an admin
//     manually edited this specific plan — a bonus price, a special
//     margin, whatever), this plan is skipped entirely. Nothing here
//     ever touches a manually-priced row. Use resetPlanToAutoPricing
//     to hand a plan back to this system.
//
// Convenience fee is FOLDED into the final retail/wholesale price
// (per the admin's explicit choice), not stored as a separate
// pricing_rules.convenience_fee_kobo add-on for auto-priced rows —
// that column is left at 0 for rows this function prices, so
// pricing.ts's existing "+ convenience_fee_kobo" addition at
// lookup/listPlans time stays a no-op for them and the number the
// admin configured is the number the customer sees, not two fees
// stacked. Manually-overridden (auto_priced = 0) rows are untouched
// and may still use that column however the admin set it by hand.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import { getPricingPolicy, applyFee, type PricingBasisStrategy } from "@/src/services/pricingPolicies"

export interface ReconcileResult {
  scanned: number
  created: number
  updated: number
  skippedManual: number
  skippedNoCost: number
}

// The provider cost basis a plan's customer price is built from. The
// router ALWAYS tries cheapest-live-provider first, regardless of
// this setting — this only controls what the customer is CHARGED, so
// a normal successful (cheapest-provider) order keeps a cushion
// instead of zero margin, and the loss on a fallback order is capped
// by design rather than open-ended.
//
// strategy is the admin's per-service_type choice (pricing_policies.
// pricing_basis_strategy), picked on the Pricing Policies screen:
//   - "cheapest" -> always the cheapest live provider's cost. Best
//     margin on a normal order, but a fallback order can lose money
//     (customer was charged for the cheapest, provider that actually
//     fulfilled was pricier).
//   - "highest"  -> always the priciest live provider's cost. Never
//     loses money on any fallback, but a normal (cheapest-provider)
//     order carries the biggest cushion — most conservative, least
//     competitive price shown to the customer.
//   - "default"  -> (unchanged from the original behavior)
//       - 1 live provider  -> that provider's cost (nothing to hedge
//         against — there's no fallback that could ever happen).
//       - 2 live providers -> the pricier of the two (which, with
//         exactly two, is also "one below the highest" — same rule,
//         same result).
//       - 3+ live providers -> one below the highest (second-most-
//         expensive), NOT the average and NOT the cheapest. This
//         bounds the worst case (router falls all the way to the
//         priciest provider) to just the gap between the two priciest
//         options, while still pricing well below the priciest
//         provider itself for every more-likely outcome.
function selectPricingBasis(
  options: { providerKey: string; providerCostKobo: number }[],
  strategy: PricingBasisStrategy,
): { providerCostKobo: number; providerKey: string; basisRank: "only" | "cheapest" | "highest" | "second-cheapest-of-two" | "second-highest" } {
  // options arrives cheapest-first (see getLivePlanProviderOptions).
  const n = options.length
  if (n === 1) {
    return { providerCostKobo: options[0].providerCostKobo, providerKey: options[0].providerKey, basisRank: "only" }
  }
  if (strategy === "cheapest") {
    return { providerCostKobo: options[0].providerCostKobo, providerKey: options[0].providerKey, basisRank: "cheapest" }
  }
  if (strategy === "highest") {
    const highest = options[n - 1]
    return { providerCostKobo: highest.providerCostKobo, providerKey: highest.providerKey, basisRank: "highest" }
  }
  // "default" — index n-2 is "one below the highest" for any n >= 2 —
  // for n === 2 that IS the highest (index 1), matching the explicit
  // two-provider rule; for n >= 3 it's the second-most-expensive.
  const basis = options[n - 2]
  return {
    providerCostKobo: basis.providerCostKobo,
    providerKey: basis.providerKey,
    basisRank: n === 2 ? "second-cheapest-of-two" : "second-highest",
  }
}

export async function reconcilePricingFromMappings(
  serviceType: VtuServiceType,
  adminUserId: string,
  nativeDB?: any,
): Promise<ReconcileResult> {
  const policy = await getPricingPolicy(serviceType, nativeDB)
  if (!policy) {
    throw new Error(
      `No pricing policy configured for "${serviceType}" — add one in migrations before reconciling.`,
    )
  }

  // Every distinct plan this service_type currently has ANY active
  // provider cost for. This is deliberately sourced from
  // provider_plan_mappings, not pricing_rules — a brand-new plan that
  // was just synced and has no pricing_rules row yet MUST show up
  // here so it gets created, not skipped.
  const distinctPlansResult = await d1Query(
    `SELECT DISTINCT network_or_biller, plan_code FROM provider_plan_mappings
     WHERE service_type = ? AND is_active = 1`,
    [serviceType],
    nativeDB,
  )
  const distinctPlans: { network_or_biller: string; plan_code: string }[] = distinctPlansResult.results ?? []

  const result: ReconcileResult = { scanned: 0, created: 0, updated: 0, skippedManual: 0, skippedNoCost: 0 }

  // Everything below used to be 3–4 sequential D1 round-trips PER
  // PLAN (getLivePlanProviderOptions re-querying provider_plan_mappings
  // AND vtu_provider_configs from scratch every iteration, plus a
  // pricing_rules SELECT, plus the UPDATE/INSERT) — fine for exam_pin's
  // handful of plans, but on data (hundreds of plans across 4+
  // networks × every size/validity/category) that serialized loop
  // routinely blew past the serverless function's execution time
  // limit, killing the request mid-flight and returning the
  // platform's own timeout error page instead of ever reaching our
  // JSON response (the "Unexpected token 'A', is not valid JSON"
  // error the admin saw is that failure mode, not a real save
  // failure). Fetching the three shared inputs ONCE up front, then
  // running the remaining per-plan writes concurrently, turns N*3-4
  // sequential round-trips into ~3 fixed ones + N concurrent ones.
  const [allMappingsResult, activeProviders, existingRulesResult] = await Promise.all([
    d1Query(
      `SELECT * FROM provider_plan_mappings
       WHERE service_type = ? AND is_active = 1
       ORDER BY provider_cost_kobo ASC`,
      [serviceType],
      nativeDB,
    ),
    (async () => {
      const { getActiveVtuProviders } = await import("@/src/services/config")
      return getActiveVtuProviders(serviceType, nativeDB)
    })(),
    d1Query(
      `SELECT id, network_or_biller, plan_code, auto_priced FROM pricing_rules
       WHERE service_type = ?`,
      [serviceType],
      nativeDB,
    ),
  ])

  const activeProviderKeys = new Set(activeProviders.map((p) => p.providerKey))

  // Group all-mappings rows by (network_or_biller, plan_code) once,
  // filtered to only providers currently enabled — same live-provider
  // definition getLivePlanProviderOptions used, just computed from the
  // one bulk fetch instead of a fresh query per plan. Rows already
  // arrive cheapest-first from the ORDER BY above, so each group stays
  // cheapest-first too.
  type MappingRow = { provider_key: string; provider_cost_kobo: number }
  const liveOptionsByPlan = new Map<string, MappingRow[]>()
  for (const row of (allMappingsResult.results ?? []) as any[]) {
    if (!activeProviderKeys.has(row.provider_key)) continue
    const key = `${row.network_or_biller}\u0000${row.plan_code}`
    const list = liveOptionsByPlan.get(key) ?? []
    list.push({ provider_key: row.provider_key, provider_cost_kobo: row.provider_cost_kobo })
    liveOptionsByPlan.set(key, list)
  }

  const existingRuleByPlan = new Map<string, { id: string; auto_priced: number }>()
  for (const row of (existingRulesResult.results ?? []) as any[]) {
    existingRuleByPlan.set(`${row.network_or_biller}\u0000${row.plan_code}`, { id: row.id, auto_priced: row.auto_priced })
  }

  const writes: Promise<void>[] = []

  for (const { network_or_biller: networkOrBiller, plan_code: planCode } of distinctPlans) {
    result.scanned++
    const key = `${networkOrBiller}\u0000${planCode}`

    // Live options only — excludes any provider the admin has
    // toggled off, not just inactive mappings. Same source the router
    // uses for its own candidate list, so a toggle changes price and
    // routing together, never one without the other.
    const options = liveOptionsByPlan.get(key) ?? []
    if (options.length === 0) {
      result.skippedNoCost++
      continue
    }
    const cheapestCostKobo = options[0].provider_cost_kobo
    const basis = selectPricingBasis(
      options.map((o) => ({ providerKey: o.provider_key, providerCostKobo: o.provider_cost_kobo })),
      policy.pricingBasisStrategy,
    )
    const providerCostKobo = basis.providerCostKobo

    const existing = existingRuleByPlan.get(key)

    if (existing && existing.auto_priced === 0) {
      result.skippedManual++
      continue
    }

    const retailFee = applyFee(providerCostKobo, policy.retailFeeType, policy.retailFeeValue)
    const wholesaleFee = applyFee(providerCostKobo, policy.wholesaleFeeType, policy.wholesaleFeeValue)
    const convenienceFee = applyFee(providerCostKobo, policy.convenienceFeeType, policy.convenienceFeeValue)

    // Convenience fee is folded in here, not stored separately — see
    // file header. convenience_fee_kobo stays 0 for auto-priced rows.
    const retailPriceKobo = providerCostKobo + retailFee + convenienceFee
    const wholesalePriceKobo = providerCostKobo + wholesaleFee + convenienceFee

    // pricing_basis_* columns record WHY this price is what it is —
    // which provider/cost the price was built from (basis), vs the
    // true cheapest live cost right now, vs the worst live cost
    // (what a full fallback-to-the-end would actually cost). This is
    // what powers the admin margin-tracking view: pricingBasisCostKobo
    // is what the customer is effectively covering; cheapestCostKobo
    // is the normal-case actual cost; worstCostKobo is the true
    // worst-case exposure if every other provider also fails.
    const worstCostKobo = options[options.length - 1].provider_cost_kobo

    if (existing) {
      result.updated++
      writes.push(
        d1Query(
          `UPDATE pricing_rules SET
            retail_price_kobo = ?, wholesale_price_kobo = ?, convenience_fee_kobo = 0,
            pricing_basis_provider_key = ?, pricing_basis_cost_kobo = ?,
            cheapest_live_cost_kobo = ?, worst_live_cost_kobo = ?, live_provider_count = ?,
            updated_by = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [
            retailPriceKobo,
            wholesalePriceKobo,
            basis.providerKey,
            providerCostKobo,
            cheapestCostKobo,
            worstCostKobo,
            options.length,
            adminUserId,
            existing.id,
          ],
          nativeDB,
        ).then(() => undefined),
      )
    } else {
      result.created++
      writes.push(
        d1Query(
          `INSERT INTO pricing_rules
            (id, service_type, network_or_biller, plan_code, retail_price_kobo, wholesale_price_kobo,
             convenience_fee_kobo, auto_priced, pricing_basis_provider_key, pricing_basis_cost_kobo,
             cheapest_live_cost_kobo, worst_live_cost_kobo, live_provider_count, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            serviceType,
            networkOrBiller,
            planCode,
            retailPriceKobo,
            wholesalePriceKobo,
            basis.providerKey,
            providerCostKobo,
            cheapestCostKobo,
            worstCostKobo,
            options.length,
            adminUserId,
          ],
          nativeDB,
        ).then(() => undefined),
      )
    }
  }

  // Fire all writes concurrently rather than one-at-a-time — there's
  // no cross-row dependency between plans, and D1 has no real
  // transaction/batch endpoint to fold these into anyway (see
  // lib/d1.ts's header comment), so concurrency is the only lever
  // available to cut wall-clock time. A failure in one plan's write
  // shouldn't silently swallow the rest — Promise.all here still
  // throws on the first rejection, matching the previous sequential
  // behavior's own failure mode (an early exception also aborted
  // everything after it in the old for-loop).
  await Promise.all(writes)

  return result
}

// Hands a manually-overridden plan back to auto-pricing. Does NOT
// reprice it immediately by itself — flips the flag, then runs the
// same reconcile pass so it's repriced from current cost + policy in
// the same call (otherwise it would silently sit stale, still showing
// the old manual price, until the next unrelated sync happened to
// touch that service_type).
export async function resetPlanToAutoPricing(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE pricing_rules SET auto_priced = 1, updated_by = ?, updated_at = datetime('now')
     WHERE service_type = ? AND network_or_biller = ? AND plan_code = ?`,
    [adminUserId, serviceType, networkOrBiller, planCode],
    nativeDB,
  )
  await reconcilePricingFromMappings(serviceType, adminUserId, nativeDB)
}
