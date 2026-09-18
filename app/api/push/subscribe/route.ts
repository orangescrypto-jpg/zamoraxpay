// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { saveSubscription } from "@/src/services/pushNotifications"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { endpoint, keys } = body ?? {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 })
    }

    await saveSubscription(auth.uid, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Subscribe failed" }, { status: 500 })
  }
}
