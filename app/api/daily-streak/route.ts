// app/api/daily-streak/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getStreakStatus, checkIn } from "@/src/services/dailyStreak"

// GET — current streak status, for display before the user checks in.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [status, historyResult, unclaimedResult] = await Promise.all([
    getStreakStatus(auth.uid),
    d1Query(
      "SELECT id, period_key, streak_day, amount_kobo, claimed, claimed_at, created_at FROM daily_streak_checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
      [auth.uid],
    ),
    d1Query(
      "SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM daily_streak_checkins WHERE user_id = ? AND claimed = 0",
      [auth.uid],
    ),
  ])

  return NextResponse.json({
    ...status,
    history: historyResult.results ?? [],
    unclaimedKobo: unclaimedResult.results?.[0]?.total ?? 0,
  })
}

// POST — perform today's check-in.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const result = await checkIn(auth.uid)
  if (!result.success) {
    return NextResponse.json({ success: false, message: result.message }, { status: 400 })
  }

  return NextResponse.json(result)
}
