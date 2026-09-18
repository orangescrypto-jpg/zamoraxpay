// app/api/cron/re-engagement/route.ts
// Runs every comeback/re-engagement push trigger (streak at risk,
// unclaimed rewards, idle wallet, weekend bonus live, referral nudge,
// inactivity win-back). Each trigger has its own feature flag and
// idempotency guard, so this is safe to schedule once a day and safe
// to re-run manually without double-sending.
//
// Vercel: add to vercel.json  { "crons": [{ "path": "/api/cron/re-engagement", "schedule": "0 9 * * *" }] }
// Cloudflare: add a Cron Trigger in wrangler.toml that fetches this URL daily.
// Any other host: point any daily scheduler at this URL.

import { NextRequest, NextResponse } from "next/server"
import { runAllReEngagementTriggers } from "@/src/services/reEngagementNotifications"
import { verifyCronAuth } from "@/src/services/cronAuth"

export async function GET(req: NextRequest) {
  const authError = await verifyCronAuth(req)
  if (authError) return authError

  const result = await runAllReEngagementTriggers()
  return NextResponse.json(result)
}
