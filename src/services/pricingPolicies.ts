// src/services/pricingPolicies.ts
// Service abstraction layer — pricing policies.
//
// One row per service_type (data, cable, electricity, airtime,
// exam_pin) holding the GENERAL fee the admin wants applied to every
// plan under that service automatically, instead of hand-typing a
// price per plan. Each fee (retail / wholesale / convenience) is
// independently either 'flat' (a kobo amount added on top of provider
// cost) or 'percentage' (basis points, e.g. 500 = 5%, multiplied
// against provider cost) — admin picks one mode per fee, not both at
// once.
//
// This table is read by reconcilePricingFromMappings (see
// pricingReconcile.ts), which is what actually applies these fees to
// pricing_rules rows. Editing a policy here does nothing to existing
// prices until reconcile runs — the admin route that saves a policy
// triggers that reconcile itself, so saving IS the "apply now" action.

import { d1Query } from "@/lib/d1"
import type { VtuServiceType } from "@/src/types"

export type FeeType = "flat" | "percentage"

export interface PricingPolicy {
  serviceType: VtuServiceType
  retailFeeType: FeeType
  retailFeeValue: number // flat: kobo. percentage: basis points (100 = 1%)
  wholesaleFeeType: FeeType
  wholesaleFeeValue: number
  convenienceFeeType: FeeType
  convenienceFeeValue: number
  updatedBy: string | null
  updatedAt: string
}

export async function listPricingPolicies(nativeDB?: any): Promise<PricingPolicy[]> {
  const result = await d1Query(
    `SELECT * FROM pricing_policies ORDER BY service_type`,
    [],
    nativeDB,
  )
  return (result.results ?? []).map(rowToPolicy)
}

export async function getPricingPolicy(
  serviceType: VtuServiceType,
  nativeDB?: any,
): Promise<PricingPolicy | null> {
  const result = await d1Query(
    `SELECT * FROM pricing_policies WHERE service_type = ?`,
    [serviceType],
    nativeDB,
  )
  const row = (result.results ?? [])[0]
  return row ? rowToPolicy(row) : null
}

// Always an UPDATE, never an INSERT — the migration seeds all 5
// service_type rows up front specifically so this never has to
// create one. If a future service_type is added, seed it in a new
// migration rather than having this silently INSERT here.
export async function updatePricingPolicy(
  params: {
    serviceType: VtuServiceType
    retailFeeType: FeeType
    retailFeeValue: number
    wholesaleFeeType: FeeType
    wholesaleFeeValue: number
    convenienceFeeType: FeeType
    convenienceFeeValue: number
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE pricing_policies SET
      retail_fee_type = ?, retail_fee_value = ?,
      wholesale_fee_type = ?, wholesale_fee_value = ?,
      convenience_fee_type = ?, convenience_fee_value = ?,
      updated_by = ?, updated_at = datetime('now')
     WHERE service_type = ?`,
    [
      params.retailFeeType,
      params.retailFeeValue,
      params.wholesaleFeeType,
      params.wholesaleFeeValue,
      params.convenienceFeeType,
      params.convenienceFeeValue,
      adminUserId,
      params.serviceType,
    ],
    nativeDB,
  )
}

function rowToPolicy(row: any): PricingPolicy {
  return {
    serviceType: row.service_type,
    retailFeeType: row.retail_fee_type,
    retailFeeValue: row.retail_fee_value,
    wholesaleFeeType: row.wholesale_fee_type,
    wholesaleFeeValue: row.wholesale_fee_value,
    convenienceFeeType: row.convenience_fee_type,
    convenienceFeeValue: row.convenience_fee_value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

// Applies one fee (flat or percentage) to a base cost. Shared by
// reconcile for retail, wholesale, and convenience fee calculations —
// same math, three different (type, value) inputs.
export function applyFee(baseCostKobo: number, feeType: FeeType, feeValue: number): number {
  if (feeType === "percentage") {
    // feeValue is basis points: 500 = 5.00%
    return Math.round(baseCostKobo * (feeValue / 10000))
  }
  return feeValue // flat: already in kobo
}
