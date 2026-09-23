// app/api/cron/retention/route.ts
// Runs every data-retention job (see src/services/retention.ts) under ONE
// shared time budget. Safe to call as often as you like: each job is
// idempotent and stops cleanly when the budget (Settings > retention_time_budget_seconds)
// is spent, picking up where it left off on the next call.
//
// Recommended schedule: once a day at a quiet hour, e.g. 03:00 Nigeria time
// (02:00 UTC). If a backlog is large (first ever run), call it a few times.
//
// Vercel: add to vercel.json
//   { "crons": [{ "path": "/api/cron/retention", "schedule": "0 2 * * *" }] }
//   and make sure your Vercel plan's function timeout is longer than the
//   time budget you set in the admin panel (default 40s).
// Cloudflare: add a Cron Trigger in wrangler.toml that fetches this URL daily.
// Any other host: point any scheduler at this URL with
//   Authorization: Bearer <CRON_SECRET>
//
// The admin panel (/admin/retention) can run every one of these jobs by
// hand, so if the cron is missed nothing is lost.

import { NextRequest, NextResponse } from "next/server"
import { verifyCronAuth } from "@/src/services/cronAuth"
import { runAllRetentionJobs } from "@/src/services/retention"

// zlib (used to gzip the R2 archives) is a Node API — this route cannot run on the Edge runtime.
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authError = await verifyCronAuth(req)
  if (authError) return authError

  try {
    const out = await runAllRetentionJobs("cron")
    const failed = out.results.filter((r) => r.status === "error").length
    return NextResponse.json({ ...out, failedJobs: failed })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Retention run failed" }, { status: 500 })
  }
}
