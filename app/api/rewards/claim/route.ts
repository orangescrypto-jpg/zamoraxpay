// app/api/rewards/claim/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getUnclaimedSummary, claimCashback, claimReferralBonus, claimStreakReward } from "@/src/services/rewardsClaim"

// GET — unclaimed totals across cashback, referral, and streak rewards.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const summary = await getUnclaimedSummary(auth.uid)
  return NextResponse.json(summary)
}

// POST — claim one reward source into the wallet. Body: { source: "cashback" | "referral" | "streak" }
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const body = await req.json().catch(() => ({}))
  const source = body?.source

  let result
  if (source === "cashback") {
    result = await claimCashback(auth.uid)
  } else if (source === "referral") {
    result = await claimReferralBonus(auth.uid)
  } else if (source === "streak") {
    result = await claimStreakReward(auth.uid)
  } else {
    return NextResponse.json({ success: false, message: "Invalid claim source" }, { status: 400 })
  }

  if (!result.success) {
    return NextResponse.json(result, { status: 400 })
  }

  return NextResponse.json(result)
}
