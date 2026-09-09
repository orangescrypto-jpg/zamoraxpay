// src/services/referral.ts
// Service abstraction layer — referral bonus awarding.
//
// Bonus amount is fully admin-controlled via site_settings
// (referral_bonus_amount_kobo) — never hardcoded. Awarded to the
// REFERRER when the person they referred completes their FIRST
// successful purchase (not just at signup — this avoids rewarding
// referrals that never actually convert into real usage).

import { d1Query } from "@/lib/d1"
import { getSettingNumber } from "@/src/services/siteSettings"
import { isFeatureEnabled } from "@/src/services/config"

/**
 * Call this after a successful order. Checks whether the purchasing
 * user was referred, whether this is their first successful order,
 * and whether that referral's bonus has already been paid — if all
 * clear, marks the referral as awarded (bonus_awarded = 1, qualified
 * and locked in) but does NOT touch the wallet. The referrer claims
 * it later from the Rewards page (see src/services/rewardsClaim.ts),
 * which is what actually calls creditWallet(). Safe to call on every
 * successful order; it's a no-op past the first qualifying purchase.
 */
export async function maybeAwardReferralBonus(purchasingUserId: string, nativeDB?: any): Promise<void> {
  if (!(await isFeatureEnabled("referral_program", nativeDB))) return

  const referralResult = await d1Query(
    "SELECT * FROM referrals WHERE referred_user_id = ? AND bonus_awarded = 0",
    [purchasingUserId],
    nativeDB,
  )
  const referral = referralResult.results?.[0]
  if (!referral) return // not referred, or bonus already paid

  // Confirm this really is their first successful order — the referral
  // row existing isn't enough proof on its own if this function were
  // ever called more than once per order in some future refactor.
  const successfulOrders = await d1Query(
    "SELECT COUNT(*) AS count FROM vtu_orders WHERE user_id = ? AND status = 'success'",
    [purchasingUserId],
    nativeDB,
  )
  if ((successfulOrders.results?.[0]?.count ?? 0) !== 1) return // not their first successful order

  const bonusKobo = await getSettingNumber("referral_bonus_amount_kobo", 20000, nativeDB)
  if (bonusKobo <= 0) return

  await d1Query(
    "UPDATE referrals SET bonus_awarded = 1, bonus_kobo = ?, awarded_at = datetime('now') WHERE id = ?",
    [bonusKobo, referral.id],
    nativeDB,
  )
}
