// src/services/rewardsClaim.ts
// Service abstraction layer — claiming earned rewards into the wallet.
//
// Daily streak check-ins, referral bonuses, and cashback awards are
// now recorded as UNCLAIMED against their own ledger row
// (daily_streak_checkins, referrals, cashback_awards). None of them
// touch the wallet until the user actively claims from the Rewards
// page. Claiming calls creditWallet(), which is what makes the credit
// show up in wallet_transactions (and therefore transaction history
// and the dashboard) and become transferable/withdrawable per the
// existing 'funding'-only withdrawal rule — cashback and referral
// claims stay non-withdrawable (spend/transfer only), same as before.
//
// Signup bonus and weekend bonus are unaffected — they still credit
// the wallet directly at the moment they're awarded.

import { d1Query } from "@/lib/d1"
import { creditWallet } from "@/src/services/wallet"

export interface UnclaimedSummary {
  cashbackUnclaimedKobo: number
  referralUnclaimedKobo: number
  streakUnclaimedKobo: number
}

export interface ClaimResult {
  success: boolean
  message: string
  amountKobo?: number
}

/** Totals across all three reward sources, for the Rewards page header. */
export async function getUnclaimedSummary(userId: string, nativeDB?: any): Promise<UnclaimedSummary> {
  const [cashbackResult, referralResult, streakResult] = await Promise.all([
    d1Query(
      "SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM cashback_awards WHERE user_id = ? AND claimed = 0",
      [userId],
      nativeDB,
    ),
    d1Query(
      "SELECT COALESCE(SUM(bonus_kobo), 0) AS total FROM referrals WHERE referrer_user_id = ? AND bonus_awarded = 1 AND claimed = 0",
      [userId],
      nativeDB,
    ),
    d1Query(
      "SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM daily_streak_checkins WHERE user_id = ? AND claimed = 0",
      [userId],
      nativeDB,
    ),
  ])

  return {
    cashbackUnclaimedKobo: cashbackResult.results?.[0]?.total ?? 0,
    referralUnclaimedKobo: referralResult.results?.[0]?.total ?? 0,
    streakUnclaimedKobo: streakResult.results?.[0]?.total ?? 0,
  }
}

/** Claims all unclaimed cashback awards for a user in one credit. */
export async function claimCashback(userId: string, nativeDB?: any): Promise<ClaimResult> {
  // Claim-and-lock in one atomic statement: the WHERE claimed = 0 means
  // only one concurrent call can ever flip a given row to claimed = 1,
  // so RETURNING tells us exactly (and only) what THIS call won. A
  // second, racing call sees zero rows returned and safely no-ops
  // instead of crediting the wallet a second time.
  const claimedResult = await d1Query(
    `UPDATE cashback_awards SET claimed = 1, claimed_at = datetime('now')
     WHERE user_id = ? AND claimed = 0
     RETURNING id, amount_kobo`,
    [userId],
    nativeDB,
  )
  const rows = claimedResult.results ?? []
  if (rows.length === 0) {
    return { success: false, message: "No cashback available to claim" }
  }

  const totalKobo = rows.reduce((sum: number, r: any) => sum + r.amount_kobo, 0)
  if (totalKobo <= 0) {
    return { success: false, message: "No cashback available to claim" }
  }

  const claimReference = `ZPCBCLAIM-${userId}-${Date.now()}`

  await creditWallet(
    {
      userId,
      amountKobo: totalKobo,
      type: "cashback",
      reference: claimReference,
      metadata: { kind: "cashback_claim", awardIds: rows.map((r: any) => r.id) },
    },
    nativeDB,
  )

  return { success: true, message: "Cashback claimed to your wallet", amountKobo: totalKobo }
}

/** Claims all unclaimed, qualified referral bonuses for a user in one credit. */
export async function claimReferralBonus(userId: string, nativeDB?: any): Promise<ClaimResult> {
  // Same atomic claim-and-lock pattern as claimCashback: the UPDATE's
  // WHERE claimed = 0 is what prevents a double credit from a racing
  // second call, and RETURNING tells us exactly what THIS call claimed.
  const claimedResult = await d1Query(
    `UPDATE referrals SET claimed = 1, claimed_at = datetime('now')
     WHERE referrer_user_id = ? AND bonus_awarded = 1 AND claimed = 0
     RETURNING id, bonus_kobo`,
    [userId],
    nativeDB,
  )
  const rows = claimedResult.results ?? []
  if (rows.length === 0) {
    return { success: false, message: "No referral bonus available to claim" }
  }

  const totalKobo = rows.reduce((sum: number, r: any) => sum + r.bonus_kobo, 0)
  if (totalKobo <= 0) {
    return { success: false, message: "No referral bonus available to claim" }
  }

  const claimReference = `ZPREFCLAIM-${userId}-${Date.now()}`

  await creditWallet(
    {
      userId,
      amountKobo: totalKobo,
      type: "referral_bonus",
      reference: claimReference,
      metadata: { kind: "referral_claim", referralIds: rows.map((r: any) => r.id) },
    },
    nativeDB,
  )

  return { success: true, message: "Referral bonus claimed to your wallet", amountKobo: totalKobo }
}

/** Claims all unclaimed daily streak check-in rewards for a user in one credit. */
export async function claimStreakReward(userId: string, nativeDB?: any): Promise<ClaimResult> {
  // Same atomic claim-and-lock pattern as claimCashback/claimReferralBonus.
  const claimedResult = await d1Query(
    `UPDATE daily_streak_checkins SET claimed = 1, claimed_at = datetime('now')
     WHERE user_id = ? AND claimed = 0
     RETURNING id, amount_kobo`,
    [userId],
    nativeDB,
  )
  const rows = claimedResult.results ?? []
  if (rows.length === 0) {
    return { success: false, message: "No check-in reward available to claim" }
  }

  const totalKobo = rows.reduce((sum: number, r: any) => sum + r.amount_kobo, 0)
  if (totalKobo <= 0) {
    return { success: false, message: "No check-in reward available to claim" }
  }

  const claimReference = `ZPDSCLAIM-${userId}-${Date.now()}`

  await creditWallet(
    {
      userId,
      amountKobo: totalKobo,
      type: "daily_streak",
      reference: claimReference,
      metadata: { kind: "streak_claim", checkinIds: rows.map((r: any) => r.id) },
    },
    nativeDB,
  )

  return { success: true, message: "Check-in reward claimed to your wallet", amountKobo: totalKobo }
}
