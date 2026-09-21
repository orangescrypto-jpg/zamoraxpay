// app/api/cron/spin/route.ts
// Spin & Win housekeeping: marks expired tickets/vouchers and sends the
// "your spin expires soon" and "your free spin is ready" pushes (each admin-toggled
// in /admin/spin, each sent at most once per user per day).
//
// Vercel: add to vercel.json  { "crons": [{ "path": "/api/cron/spin", "schedule": "0 * * * *" }] }   (hourly)
// Cloudflare: add a Cron Trigger that fetches this URL hourly.
// Any other host: point any hourly scheduler at this URL with the same Bearer secret as the other cron routes.

import { NextRequest, NextResponse } from "next/server"
import { runSpinCron } from "@/src/services/spinNotifications"
import { verifyCronAuth } from "@/src/services/cronAuth"

export async function GET(req: NextRequest) {
  const authError = await verifyCronAuth(req)
  if (authError) return authError

  const result = await runSpinCron()
  return NextResponse.json(result)
}
