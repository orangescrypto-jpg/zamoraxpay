// app/api/withdrawal-status/route.ts
// Public route — tells the frontend whether withdrawals are currently
// enabled, so the dashboard "Withdraw" button and the /withdraw page
// can hide/disable themselves when the admin turns the feature off.
// This mirrors /api/whatsapp-support and /api/airtime-to-cash: no
// auth required, single boolean, safe to expose to any visitor.
//
// Server-side enforcement still lives in POST /api/wallet/withdraw —
// this route only controls what the UI shows; it is not itself the
// guardrail against withdrawals happening while the flag is off.

import { NextResponse } from "next/server"
import { d1Query } from "@/lib/d1"

export async function GET() {
  const result = await d1Query("SELECT is_enabled FROM feature_flags WHERE key = 'withdrawal'", [])
  const row = result.results?.[0]
  // Same default-to-enabled posture as isFeatureEnabled(): a flag row
  // that hasn't been seeded yet should never silently hide a feature
  // nobody explicitly turned off.
  const enabled = row ? row.is_enabled === 1 : true

  return NextResponse.json({ enabled })
}
