// app/api/push/unsubscribe/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { removeSubscription } from "@/src/services/pushNotifications"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

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
