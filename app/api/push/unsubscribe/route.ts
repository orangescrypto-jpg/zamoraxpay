// app/api/push/unsubscribe/route.ts
import { NextRequest, NextResponse } from "next/server"
import { removeSubscription } from "@/src/services/pushNotifications"

// Unauthenticated by design, same reasoning as /api/push/subscribe —
// logged-out subscribers must be able to turn notifications back off
// too. Deletion is by endpoint (unique per subscription), so no user
// identity is needed to authorize it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint } = body ?? {}
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint is required" }, { status: 400 })
    }

    await removeSubscription(endpoint)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unsubscribe failed" }, { status: 500 })
  }
}
