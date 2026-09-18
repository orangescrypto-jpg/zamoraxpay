// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getUserFromRequest } from "@/lib/auth-server"
import { saveSubscription } from "@/src/services/pushNotifications"

// Unauthenticated by design — the enable-notifications banner now shows
// site-wide (logged-in and logged-out visitors alike), so this can't
// require a session. If a valid bearer token IS present we still tag
// the subscription with that user_id (best-effort, ignored on failure)
// so user-targeted sends can also reach them later; anonymous callers
// simply get userId: null.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, keys } = body ?? {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 })
    }

    const { user } = await getUserFromRequest(req).catch(() => ({ user: null }))

    await saveSubscription(user?.id ?? null, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Subscribe failed" }, { status: 500 })
  }
}
