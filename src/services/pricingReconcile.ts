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
//   - Finds the cheapest ACTIVE provider_plan_mappings row for that
//     plan (same query, same "cheapest first" ordering, that the VTU
//     router itself uses at purchase time — see
//     getPlanProviderOptions in providerPlanMappings.ts — so pricing
//     and routing can never disagree about which provider is the cost
//     basis).
//   - If no pricing_rules row exists yet for that plan, creates one,
//     auto_priced = 1, priced from cheapest cost + the service's
//     policy fees.
//   - If a pricing_rules row exists and auto_priced = 1, recalculates
//     retail/wholesale/convenience from the CURRENT cheapest cost +
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
import type { VtuServiceType } from "@/src/types"
import { getPlanProviderOptions } from "@/src/services/providerPlanMappings"
import { getPricingPolicy, applyFee } from "@/src/services/pricingPolicies"

export interface ReconcileResult {
  scanned: number
  created: number
  updated: number
  skippedManual: number
  skippedNoCost: number
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

  for (const { network_or_biller: networkOrBiller, plan_code: planCode } of distinctPlans) {
    result.scanned++

    // Cheapest-first, same query the router uses — the floor both
    // systems agree on.
    const options = await getPlanProviderOptions(serviceType, networkOrBiller, planCode, nativeDB)
    const cheapest = options[0]
    if (!cheapest) {
      result.skippedNoCost++
      continue
    }
    const providerCostKobo = cheapest.providerCostKobo

    const existingResult = await d1Query(
      `SELECT id, auto_priced FROM pricing_rules
       WHERE service_type = ? AND network_or_biller = ? AND plan_code = ?
       LIMIT 1`,
      [serviceType, networkOrBiller, planCode],
      nativeDB,
    )
    const existing = existingResult.results?.[0]

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

    if (existing) {
      await d1Query(
        `UPDATE pricing_rules SET
          retail_price_kobo = ?, wholesale_price_kobo = ?, convenience_fee_kobo = 0,
          updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [retailPriceKobo, wholesalePriceKobo, adminUserId, existing.id],
        nativeDB,
      )
      result.updated++
    } else {
      const { randomUUID } = await import("crypto")
      await d1Query(
        `INSERT INTO pricing_rules
          (id, service_type, network_or_biller, plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo, auto_priced, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
        [randomUUID(), serviceType, networkOrBiller, planCode, retailPriceKobo, wholesalePriceKobo, adminUserId],
        nativeDB,
      )
      result.created++
    }
  }

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
