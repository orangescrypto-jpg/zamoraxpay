// app/api/push/vapid-public-key/route.ts
// Exposes the VAPID public key so the browser can subscribe to push.
// Public key is safe to expose (that's the point of the public/private
// split) — only the private key stays server-side.
import { NextResponse } from "next/server"
import { getVapidPublicKey } from "@/src/services/pushNotifications"

export async function GET() {
  const publicKey = await getVapidPublicKey()
  if (!publicKey) {
    return NextResponse.json({ error: "Push notifications are not configured yet" }, { status: 404 })
  }
  return NextResponse.json({ publicKey })
}
