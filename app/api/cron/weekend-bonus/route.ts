// app/api/cron/weekend-bonus/route.ts
// Credits every active user with the admin-configured weekend bonus
// on qualifying days — call this once a day from an external
// scheduler, protected by the same shared secret as the other cron
// routes. It's a no-op (and cheap) on any non-weekend day, so it's
// simplest to schedule it to run daily rather than trying to encode
// "only Saturdays and Sundays" into the scheduler itself — that logic
// already lives in weekend_bonus_days (see src/services/weekendBonus.ts)
// and can be changed by an admin without touching the schedule.
//
// Vercel: add to vercel.json  { "crons": [{ "path": "/api/cron/weekend-bonus", "schedule": "0 6 * * *" }] }
// Cloudflare: add a Cron Trigger in wrangler.toml that fetches this URL daily.
// Any other host: point any daily scheduler (cron job, GitHub Actions, etc.) at this URL.

import { NextRequest, NextResponse } from "next/server"
import { runWeekendBonusForToday } from "@/src/services/weekendBonus"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runWeekendBonusForToday()
  return NextResponse.json(result)
}
