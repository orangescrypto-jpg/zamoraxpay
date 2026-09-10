// src/services/depositBonus.ts
// Service abstraction layer — deposit (wallet funding) bonus.
//
// Every knob here is admin-controlled via site_settings (see
// migrations/schema.sql seed data) plus the 'deposit_bonus' feature
// flag:
//   - deposit_bonus_enabled          — master on/off (in addition to the flag)
//   - deposit_bonus_min_amount_kobo  — deposit must be at least this much to qualify
//   - deposit_bonus_type             — 'percentage' | 'flat'
//   - deposit_bonus_percentage       — used when type = 'percentage'
//   - deposit_bonus_flat_amount_kobo — used when type = 'flat'
//   - deposit_bonus_max_amount_kobo  — cap per deposit (0 = uncapped)
//
// Unlike cashback (claimed later from the Rewards page), a deposit
// bonus is credited to the wallet immediately, right after the
// funding itself lands — the same instant pattern as signupBonus.ts.
// It is spend-only, never withdrawable: it uses its own
// wallet_transactions.type ('deposit_bonus'), which the withdrawal
// balance calculation already excludes since it only counts
// type = 'funding'.

import { creditWallet } from "@/src/services/wallet"
import { isFeatureEnabled } from "@/src/services/config"
import { getSetting, getSettingBoolean, getSettingNumber } from "@/src/services/siteSettings"

export interface DepositBonusCalculation {
  eligible: boolean
  amountKobo: number
  reason?: string
}

export async function calculateDepositBonus(depositAmountKobo: number, nativeDB?: any): Promise<DepositBonusCalculation> {
  const flagEnabled = await isFeatureEnabled("deposit_bonus", nativeDB)
  const settingEnabled = await getSettingBoolean("deposit_bonus_enabled", false, nativeDB)

  if (!flagEnabled || !settingEnabled) {
    return { eligible: false, amountKobo: 0, reason: "Deposit bonus is currently disabled" }
  }

  const minAmount = await getSettingNumber("deposit_bonus_min_amount_kobo", 0, nativeDB)
  if (depositAmountKobo < minAmount) {
    return { eligible: false, amountKobo: 0, reason: `Deposit below minimum of ${minAmount} kobo` }
  }

  const type = (await getSetting("deposit_bonus_type", nativeDB)) ?? "percentage"
  let amountKobo: number

  if (type === "flat") {
    amountKobo = await getSettingNumber("deposit_bonus_flat_amount_kobo", 0, nativeDB)
  } else {
    const percentage = await getSettingNumber("deposit_bonus_percentage", 0, nativeDB)
    amountKobo = Math.round((depositAmountKobo * percentage) / 100)
  }

  const maxCap = await getSettingNumber("deposit_bonus_max_amount_kobo", 0, nativeDB)
  if (maxCap > 0 && amountKobo > maxCap) {
    amountKobo = maxCap
  }

  if (amountKobo <= 0) {
    return { eligible: false, amountKobo: 0, reason: "Calculated deposit bonus is zero" }
  }

  return { eligible: true, amountKobo }
}

/**
 * Call this right after a wallet funding credit succeeds (type:
 * "funding"). Safe to call even if the flag is off, the setting is
 * off, or the amount comes out to zero — it will simply report
 * awarded: false and skip crediting.
 *
 * Idempotent via creditWallet's own reference-uniqueness check: the
 * reference is derived from the funding reference, so calling this
 * twice for the same deposit (e.g. webhook + verify-on-return race)
 * never double-credits.
 */
export async function awardDepositBonusForFunding(
  params: { userId: string; depositAmountKobo: number; fundingReference: string },
  nativeDB?: any,
): Promise<DepositBonusCalculation> {
  const calc = await calculateDepositBonus(params.depositAmountKobo, nativeDB)
  if (!calc.eligible) return calc

  await creditWallet(
    {
      userId: params.userId,
      amountKobo: calc.amountKobo,
      type: "deposit_bonus",
      reference: `ZPDB-${params.fundingReference}`,
      metadata: { reason: "deposit_bonus", fundingReference: params.fundingReference },
    },
    nativeDB,
  )

  return calc
}
