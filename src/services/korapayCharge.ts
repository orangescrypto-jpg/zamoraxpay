// src/services/korapayCharge.ts
// Service abstraction layer — Korapay transaction charge.
//
// Every knob here is admin-controlled via site_settings (see
// migrations/schema.sql seed data):
//   - korapay_charge_enabled          — master on/off
//   - korapay_charge_type             — 'percentage' | 'flat'
//   - korapay_charge_percentage       — used when type = 'percentage'
//   - korapay_charge_flat_amount_kobo — used when type = 'flat'
//   - korapay_charge_max_amount_kobo  — cap per deposit (0 = uncapped)
//
// This mirrors depositBonus.ts, but debits instead of credits: it
// exists to pass Korapay's processing charge on to the user, deducted
// from the wallet immediately after a deposit lands — same instant
// pattern, opposite direction. It applies to wallet funding through
// any provider (not just Korapay) since the admin may want a single
// deposit charge regardless of which gateway processed the payment.
//
// It uses its own wallet_transactions.type ('korapay_charge') so it
// shows up as its own line in transaction history rather than being
// folded into the funding credit.

import { debitWallet } from "@/src/services/wallet"
import { getSetting, getSettingBoolean, getSettingNumber } from "@/src/services/siteSettings"

export interface KorapayChargeCalculation {
  applicable: boolean
  amountKobo: number
  reason?: string
}

export async function calculateKorapayCharge(depositAmountKobo: number, nativeDB?: any): Promise<KorapayChargeCalculation> {
  const enabled = await getSettingBoolean("korapay_charge_enabled", false, nativeDB)
  if (!enabled) {
    return { applicable: false, amountKobo: 0, reason: "Korapay charges are currently disabled" }
  }

  const type = (await getSetting("korapay_charge_type", nativeDB)) ?? "percentage"
  let amountKobo: number

  if (type === "flat") {
    amountKobo = await getSettingNumber("korapay_charge_flat_amount_kobo", 0, nativeDB)
  } else {
    const percentage = await getSettingNumber("korapay_charge_percentage", 0, nativeDB)
    amountKobo = Math.round((depositAmountKobo * percentage) / 100)
  }

  const maxCap = await getSettingNumber("korapay_charge_max_amount_kobo", 0, nativeDB)
  if (maxCap > 0 && amountKobo > maxCap) {
    amountKobo = maxCap
  }

  // Safety net: never let the charge exceed the deposit it's being
  // taken from, no matter what the admin configures.
  if (amountKobo > depositAmountKobo) {
    amountKobo = depositAmountKobo
  }

  if (amountKobo <= 0) {
    return { applicable: false, amountKobo: 0, reason: "Calculated Korapay charge is zero" }
  }

  return { applicable: true, amountKobo }
}

/**
 * Call this right after a wallet funding credit succeeds (type:
 * "funding"), for any provider. Safe to call even if the setting is
 * off or the amount comes out to zero — it will simply report
 * applied: false and skip debiting.
 *
 * Idempotent via debitWallet's own reference-uniqueness check: the
 * reference is derived from the funding reference, so calling this
 * twice for the same deposit (e.g. webhook + verify-on-return race)
 * never double-charges.
 */
export async function applyKorapayChargeForFunding(
  params: { userId: string; depositAmountKobo: number; fundingReference: string },
  nativeDB?: any,
): Promise<KorapayChargeCalculation> {
  const calc = await calculateKorapayCharge(params.depositAmountKobo, nativeDB)
  if (!calc.applicable) return calc

  await debitWallet(
    {
      userId: params.userId,
      amountKobo: calc.amountKobo,
      type: "korapay_charge",
      reference: `ZPKC-${params.fundingReference}`,
      metadata: { reason: "korapay_charge", fundingReference: params.fundingReference },
    },
    nativeDB,
  )

  return calc
}
