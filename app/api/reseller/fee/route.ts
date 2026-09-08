// app/api/reseller/fee/route.ts
// Public (logged-in customer) read of the current reseller upgrade
// fee, so the /reseller page can show the real, admin-configured
// amount instead of a hardcoded figure baked into the frontend.
// Admin edits the actual value at /admin/settings ("Reseller: Upgrade
// Fee"); this route only ever reflects it, never sets it.

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getSettingNumber } from "@/src/services/siteSettings"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const upgradeFeeKobo = await getSettingNumber("reseller_upgrade_fee_kobo", 300_000)
  return NextResponse.json({ upgradeFeeKobo })
}
