// app/api/referrals/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getSettingNumber } from "@/src/services/siteSettings"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [userResult, referralsResult, bonusKobo] = await Promise.all([
    d1Query("SELECT referral_code FROM users WHERE id = ?", [auth.uid]),
    d1Query(
      "SELECT id, bonus_awarded, bonus_kobo, awarded_at, claimed, claimed_at, created_at FROM referrals WHERE referrer_user_id = ? ORDER BY created_at DESC",
      [auth.uid],
    ),
    getSettingNumber("referral_bonus_amount_kobo", 20000),
  ])

  const referralCode = userResult.results?.[0]?.referral_code ?? null
  const referrals = referralsResult.results ?? []

  const totalEarnedKobo = referrals.reduce(
    (sum: number, r: any) => sum + (r.bonus_awarded ? r.bonus_kobo : 0),
    0,
  )
  const unclaimedKobo = referrals.reduce(
    (sum: number, r: any) => sum + (r.bonus_awarded && !r.claimed ? r.bonus_kobo : 0),
    0,
  )

  return NextResponse.json({
    referralCode,
    bonusPerReferralKobo: bonusKobo,
    totalReferrals: referrals.length,
    totalEarnedKobo,
    unclaimedKobo,
    referrals,
  })
}
