// app/api/cashback/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

// GET — cashback totals and award history, for the Rewards page.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [historyResult, unclaimedResult, lifetimeResult] = await Promise.all([
    d1Query(
      "SELECT id, order_id, amount_kobo, claimed, claimed_at, created_at FROM cashback_awards WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
      [auth.uid],
    ),
    d1Query(
      "SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM cashback_awards WHERE user_id = ? AND claimed = 0",
      [auth.uid],
    ),
    d1Query("SELECT cashback_kobo FROM wallets WHERE user_id = ?", [auth.uid]),
  ])

  return NextResponse.json({
    history: historyResult.results ?? [],
    unclaimedKobo: unclaimedResult.results?.[0]?.total ?? 0,
    lifetimeEarnedKobo: lifetimeResult.results?.[0]?.cashback_kobo ?? 0,
  })
}
