// app/api/health/route.ts
// Lightweight liveness endpoint used by the failover gateway
// (infrastructure/failover) to decide whether a backup origin is healthy.
// Intentionally does NOT query D1, Supabase, or any provider, so a database
// outage does not mark the app as down for routing purposes.

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json(
    { status: "ok", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  )
}
