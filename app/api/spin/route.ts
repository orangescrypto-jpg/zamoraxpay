// app/api/spin/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getSpinStatus, hashForAbuse, performSpin } from "@/src/services/spinEngine"

// GET — the user's spin status: available tickets (with expiry), the wheel layout for
// each source they hold a ticket for, and whether the popup is enabled. Also where the
// free daily / weekend ticket is created the first time the dashboard loads that day.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const status = await getSpinStatus(auth.uid)
    return NextResponse.json(status)
  } catch (err) {
    // Spin tables not migrated yet (or any hiccup) → behave as "spin is off", never break the dashboard.
    console.error("[api/spin] status failed:", err)
    return NextResponse.json({ enabled: false, tickets: [], wheels: {}, popupEnabled: false, winnersEnabled: false })
  }
}

// POST — spin. Body: { ticketId?: string }. The prize is decided and saved on the server
// before this responds; the browser only animates the result.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const body = await req.json().catch(() => ({}))
  const ticketId = typeof body?.ticketId === "string" ? body.ticketId : undefined

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || ""
  const ua = req.headers.get("user-agent") || ""
  const ipHash = ip ? hashForAbuse(`ip:${ip}`) : undefined
  // "Device" = IP + user agent. Coarse on purpose (no fingerprinting), enough to catch one device farming many accounts.
  const deviceHash = ip || ua ? hashForAbuse(`dev:${ip}|${ua}`) : undefined

  const result = await performSpin({ userId: auth.uid, ticketId, ipHash, deviceHash })
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: result.status })
  }
  return NextResponse.json({ success: true, ...result.outcome })
}
