// app/api/admin/providers/payment/credentials/route.ts
// Reveals the CURRENTLY SAVED credentials for one payment provider
// (Korapay/Paystack) so the admin "Set keys" modal can pre-fill
// instead of always showing a blank template. Mirrors
// app/api/admin/providers/vtu/credentials/route.ts — the payment
// side was missing this endpoint, which combined with the
// non-merging update in src/services/config.ts meant re-saving one
// field (e.g. Webhook Secret) silently wiped the other (e.g. Secret
// Key), since the admin always had to retype both from scratch.
// Returns decrypted secret values, so this is gated to super_admin
// just like the PATCH that writes them.

import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-server"
import { getPaymentProviderCredentials } from "@/src/services/config"

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  const providerKey = req.nextUrl.searchParams.get("providerKey")
  if (!providerKey) {
    return NextResponse.json({ error: "providerKey query param is required" }, { status: 400 })
  }

  const credentials = await getPaymentProviderCredentials(providerKey)
  return NextResponse.json({ credentials })
}
