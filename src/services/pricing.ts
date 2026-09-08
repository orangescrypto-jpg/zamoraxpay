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

export async function listPricingRules(serviceType?: VtuServiceType, nativeDB?: any) {
  const sql = serviceType
    ? "SELECT * FROM pricing_rules WHERE service_type = ? ORDER BY network_or_biller"
    : "SELECT * FROM pricing_rules ORDER BY service_type, network_or_biller"
  const result = await d1Query(sql, serviceType ? [serviceType] : [], nativeDB)
  return result.results ?? []
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
