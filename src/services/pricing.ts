// src/services/pricing.ts
// Service abstraction layer — pricing.
//
// Every price a user sees or is charged comes from here, reading
// admin-editable pricing_rules in D1 — never hardcoded in a checkout
// route. Admin can adjust retail/wholesale prices or fees per
// network/biller at any time without a redeploy.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import { getActiveVtuProviders } from "@/src/services/config"

export interface PricingLookupResult {
  found: boolean
  baseAmountKobo: number // what we pay the VTU provider
  chargeAmountKobo: number // what we charge the user (base + fee, at their tier's price)
  convenienceFeeKobo: number
  tierUsed: "retail" | "wholesale"
}

export async function lookupPrice(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string | null,
  userTier: "retail" | "reseller",
  requestedAmountKobo?: number, // used for flexible-amount services like airtime/electricity
  nativeDB?: any,
): Promise<PricingLookupResult> {
  const result = await d1Query(
    `SELECT * FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1
       AND (plan_code = ? OR (plan_code IS NULL AND ? IS NULL))
     LIMIT 1`,
    [serviceType, networkOrBiller, planCode, planCode],
    nativeDB,
  )

  const rule = result.results?.[0]

  // Flexible-amount services (airtime, electricity, betting) don't have
  // a fixed plan price — the user names the amount, and we just apply
  // the convenience fee on top, at whatever fee the admin has set for
  // that biller (falling back to zero if unconfigured).
  if (!rule) {
    if (requestedAmountKobo) {
      return {
        found: true,
        baseAmountKobo: requestedAmountKobo,
        chargeAmountKobo: requestedAmountKobo,
        convenienceFeeKobo: 0,
        tierUsed: userTier === "reseller" ? "wholesale" : "retail",
      }
    }
    return { found: false, baseAmountKobo: 0, chargeAmountKobo: 0, convenienceFeeKobo: 0, tierUsed: "retail" }
  }

  const tierUsed = userTier === "reseller" ? "wholesale" : "retail"
  const priceKobo = tierUsed === "wholesale" ? rule.wholesale_price_kobo : rule.retail_price_kobo

  return {
    found: true,
    baseAmountKobo: rule.retail_price_kobo, // approx. provider cost basis for margin tracking
    chargeAmountKobo: priceKobo + rule.convenience_fee_kobo,
    convenienceFeeKobo: rule.convenience_fee_kobo,
    tierUsed,
  }
}

export interface CustomerPlan {
  planCode: string
  priceKobo: number
}

// Customer-facing plan list for a given service/network, priced at the
// caller's tier. Unlike listPricingRules (admin-only, full rows), this
// only returns what a buy-data/buy-cable page needs, and never exposes
// wholesale price, provider cost basis, or admin metadata.
//
// A plan only shows here if BOTH are true:
//   1. pricing_rules.is_active = 1 (the admin's manual visibility toggle)
//   2. At least one provider_plan_mappings row for this exact plan is
//      is_active = 1 AND that provider is currently enabled in
//      vtu_provider_configs.
//
// Without (2), disabling a provider that was the ONLY one fulfilling a
// plan would leave that plan visible and purchasable on the buy page
// with zero working route underneath — the user pays, the router finds
// no enabled candidate, and the order fails after the wallet's already
// been debited. This makes visibility track provider status live,
// instead of relying on an admin remembering to flip pricing_rules
// off by hand every time they disable a provider.
export async function listPlans(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  userTier: "retail" | "reseller",
  nativeDB?: any,
): Promise<CustomerPlan[]> {
  const result = await d1Query(
    `SELECT plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo
     FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1 AND plan_code IS NOT NULL
     ORDER BY retail_price_kobo`,
    [serviceType, networkOrBiller],
    nativeDB,
  )

  const rows = result.results ?? []
  if (rows.length === 0) return []

  const activeProviders = await getActiveVtuProviders(serviceType, nativeDB)
  const activeProviderKeys = new Set(activeProviders.map((p) => p.providerKey))

  // Services without plan-coded provider mappings at all (airtime,
  // electricity/betting with no meter-type mapping) never had rows in
  // provider_plan_mappings to begin with — for those, provider
  // liveness is already covered by getActiveVtuProviders alone at
  // purchase time, so skip the extra join and keep prior behavior.
  const planCodes = rows.map((r: any) => r.plan_code)
  const placeholders = planCodes.map(() => "?").join(",")
  const mappingResult = await d1Query(
    `SELECT DISTINCT plan_code, provider_key FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1
       AND plan_code IN (${placeholders})`,
    [serviceType, networkOrBiller, ...planCodes],
    nativeDB,
  )
  const mappingRows = mappingResult.results ?? []

  // Only plan_codes that have NO mappings at all skip the liveness
  // check (nothing to check — same as before). Plan codes WITH
  // mappings must have at least one mapped provider currently enabled.
  const planCodesWithMappings = new Set(mappingRows.map((r: any) => r.plan_code))
  const planCodesWithLiveProvider = new Set(
    mappingRows.filter((r: any) => activeProviderKeys.has(r.provider_key)).map((r: any) => r.plan_code),
  )

  const wholesale = userTier === "reseller"

  const finalPlans = rows
    .filter((row: any) => {
      if (!planCodesWithMappings.has(row.plan_code)) return true // unmapped plan — no liveness signal to check
      return planCodesWithLiveProvider.has(row.plan_code)
    })
    .map((row: any) => ({
      planCode: row.plan_code,
      priceKobo: (wholesale ? row.wholesale_price_kobo : row.retail_price_kobo) + row.convenience_fee_kobo,
    }))

  // Sort by the actual price shown to the customer (base price + fee),
  // not just base price — the SQL ORDER BY only sorts base price, and
  // per-plan convenience fees can push the final price out of that
  // order (e.g. two ₦100 plans with different fees end up at ₦102 and
  // ₦110, which need to be re-sorted here to stay cheapest-first).
  finalPlans.sort((a, b) => a.priceKobo - b.priceKobo)

  return finalPlans
}

export async function listPricingRules(serviceType?: VtuServiceType, nativeDB?: any) {
  const sql = serviceType
    ? "SELECT * FROM pricing_rules WHERE service_type = ? ORDER BY network_or_biller"
    : "SELECT * FROM pricing_rules ORDER BY service_type, network_or_biller"
  const result = await d1Query(sql, serviceType ? [serviceType] : [], nativeDB)
  return result.results ?? []
}

// Look up a rule by its natural key (service_type + network_or_biller +
// plan_code — this table has no UNIQUE constraint, so unlike
// provider_plan_mappings there's no DB-level upsert to lean on; the
// bulk CSV uploader uses this to decide INSERT vs UPDATE itself, and
// to tell the admin which one happened.
export async function findPricingRuleByNaturalKey(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string | null,
  nativeDB?: any,
) {
  const result = await d1Query(
    `SELECT * FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ?
       AND (plan_code = ? OR (plan_code IS NULL AND ? IS NULL))
     LIMIT 1`,
    [serviceType, networkOrBiller, planCode, planCode],
    nativeDB,
  )
  return result.results?.[0] ?? null
}

export async function upsertPricingRule(
  params: {
    id?: string
    serviceType: VtuServiceType
    networkOrBiller: string
    planCode: string | null
    retailPriceKobo: number
    wholesalePriceKobo: number
    convenienceFeeKobo: number
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  if (params.id) {
    await d1Query(
      `UPDATE pricing_rules SET
        network_or_biller = ?, plan_code = ?,
        retail_price_kobo = ?, wholesale_price_kobo = ?, convenience_fee_kobo = ?,
        updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        params.networkOrBiller,
        params.planCode,
        params.retailPriceKobo,
        params.wholesalePriceKobo,
        params.convenienceFeeKobo,
        adminUserId,
        params.id,
      ],
      nativeDB,
    )
  } else {
    await d1Query(
      `INSERT INTO pricing_rules
        (id, service_type, network_or_biller, plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        params.serviceType,
        params.networkOrBiller,
        params.planCode,
        params.retailPriceKobo,
        params.wholesalePriceKobo,
        params.convenienceFeeKobo,
        adminUserId,
      ],
      nativeDB,
    )
  }
}

export async function deletePricingRule(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM pricing_rules WHERE id = ?", [id], nativeDB)
}
