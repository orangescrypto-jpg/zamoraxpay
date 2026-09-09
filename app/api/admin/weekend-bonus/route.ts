// app/api/admin/weekend-bonus/route.ts
// Lets an admin run the weekend bonus payout manually from the admin
// panel, instead of only ever relying on the daily cron
// (app/api/cron/weekend-bonus/route.ts). Both paths call the exact
// same runWeekendBonusForToday() service function, so a manual run
// behaves identically to a cron run — same flag/amount checks, same
// per-user idempotency guard (a user already paid today's period
// can't be paid again by a manual click).
//
// GET returns recent payout history so the admin panel can show
// "last run" info without needing a separate endpoint.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { runWeekendBonusForToday } from "@/src/services/weekendBonus"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query(
    `SELECT period_key, COUNT(*) AS paid_count, SUM(amount_kobo) AS total_kobo, MAX(created_at) AS last_paid_at
     FROM weekend_bonus_payouts
     GROUP BY period_key
     ORDER BY period_key DESC
     LIMIT 12`,
  )

  return NextResponse.json({ runs: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    // ignoreDayCheck lets an admin force today's payout even if today
    // isn't one of the configured weekend_bonus_days — e.g. paying it
    // a day early, or catching up a day that was missed. Defaults to
    // false so a plain manual run still respects the configured days,
    // matching what the cron would have done.
    const body = await req.json().catch(() => ({}))
    const ignoreDayCheck = body?.ignoreDayCheck === true

    const result = await runWeekendBonusForToday(undefined, new Date(), { ignoreDayCheck })

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'weekend_bonus.manual_run', 'weekend_bonus_payouts', ?, NULL, ?)`,
      [randomUUID(), auth.uid, result.periodKey ?? null, JSON.stringify(result)],
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Weekend bonus run failed" }, { status: 500 })
  }
}
