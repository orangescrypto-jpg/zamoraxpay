// app/api/admin/providers/vtu/credentials/route.ts
// Reveals the CURRENTLY SAVED credentials for one VTU provider so the
// admin "Set keys" modal can pre-fill instead of always showing a
// blank template (which previously caused every edit to silently
// wipe out whatever wasn't retyped). Returns decrypted secret values,
// so this is gated to super_admin just like the PATCH that writes
// them.

import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-server"
import { getVtuProviderCredentials } from "@/src/services/config"

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  const providerKey = req.nextUrl.searchParams.get("providerKey")
  if (!providerKey) {
    return NextResponse.json({ error: "providerKey query param is required" }, { status: 400 })
  }

  const credentials = await getVtuProviderCredentials(providerKey)
  return NextResponse.json({ credentials })
}
