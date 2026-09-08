// src/services/cashback.ts
// Service abstraction layer — cashback rules and awarding.
//
// Every knob here is admin-controlled via site_settings (see
// migrations/schema.sql seed data) plus the 'cashback' feature flag:
//   - cashback_enabled       — master on/off (in addition to the flag)
//   - cashback_min_amount_kobo — purchase must be at least this much to qualify
//   - cashback_type          — 'percentage' | 'flat'
//   - cashback_percentage    — used when type = 'percentage'
//   - cashback_flat_amount_kobo — used when type = 'flat'
//   - cashback_max_amount_kobo  — cap per purchase (0 = uncapped)
//
// Nothing about the calculation is hardcoded — an admin can flip
// between percentage and flat mode, change the minimum threshold, or
// turn it off entirely, all without a redeploy.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { isFeatureEnabled } from "@/src/services/config"
import { getSetting, getSettingBoolean, getSettingNumber } from "@/src/services/siteSettings"
import { creditWallet } from "@/src/services/wallet"

export interface CashbackCalculation {
  eligible: boolean
  amountKobo: number
  reason?: string
}

export async function calculateCashback(purchaseAmountKobo: number, nativeDB?: any): Promise<CashbackCalculation> {
  const flagEnabled = await isFeatureEnabled("cashback", nativeDB)
  const settingEnabled = await getSettingBoolean("cashback_enabled", true, nativeDB)

  if (!flagEnabled || !settingEnabled) {
    return { eligible: false, amountKobo: 0, reason: "Cashback is currently disabled" }
  }

  const minAmount = await getSettingNumber("cashback_min_amount_kobo", 50000, nativeDB)
  if (purchaseAmountKobo < minAmount) {
    return { eligible: false, amountKobo: 0, reason: `Purchase below minimum of ${minAmount} kobo` }
  }

  const type = (await getSetting("cashback_type", nativeDB)) ?? "percentage"
  let amountKobo: number

  if (type === "flat") {
    amountKobo = await getSettingNumber("cashback_flat_amount_kobo", 10000, nativeDB)
  } else {
    const percentage = await getSettingNumber("cashback_percentage", 2, nativeDB)
    amountKobo = Math.round((purchaseAmountKobo * percentage) / 100)
  }

  const maxCap = await getSettingNumber("cashback_max_amount_kobo", 0, nativeDB)
  if (maxCap > 0 && amountKobo > maxCap) {
    amountKobo = maxCap
  }

  if (amountKobo <= 0) {
    return { eligible: false, amountKobo: 0, reason: "Calculated cashback is zero" }
  }

  return { eligible: true, amountKobo }
}

/**
 * Calculates and credits cashback for a successful order. Idempotent
 * via the wallet ledger's own reference-uniqueness check (keyed off
 * the order id), so calling this twice for the same order is safe.
 */
export async function awardCashbackForOrder(
  params: { userId: string; orderId: string; purchaseAmountKobo: number },
  nativeDB?: any,
): Promise<CashbackCalculation> {
  const calc = await calculateCashback(params.purchaseAmountKobo, nativeDB)
  if (!calc.eligible) return calc

  await creditWallet(
    {
      userId: params.userId,
      amountKobo: calc.amountKobo,
      type: "cashback",
      reference: `ZPCB-${params.orderId}`,
      relatedOrderId: params.orderId,
      metadata: { purchaseAmountKobo: params.purchaseAmountKobo },
    },
    nativeDB,
  )

  // Track lifetime cashback on the wallet row separately from the
  // ledger, for a fast "total cashback earned" display without
  // summing the whole transaction history every time.
  await d1Query(
    "UPDATE wallets SET cashback_kobo = cashback_kobo + ? WHERE user_id = ?",
    [calc.amountKobo, params.userId],
    nativeDB,
  )

  return calc
}
