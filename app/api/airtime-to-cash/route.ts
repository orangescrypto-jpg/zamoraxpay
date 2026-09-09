// app/api/airtime-to-cash/route.ts
// Public route — the "Airtime to Cash" page reads its on/off state,
// discount rate, and contact info from here. No purchase flow, no
// wallet ledger entry: the actual airtime-for-cash exchange happens
// off-platform between the user and the contact below. This route
// only tells the frontend what to display.
//
// Requires no auth since the page itself needs to render the same
// way for any logged-in user, and there's no sensitive data here —
// same posture as /api/whatsapp-support.

import { NextResponse } from "next/server"
import { d1Query } from "@/lib/d1"

export async function GET() {
  const [flagResult, settingsResult] = await Promise.all([
    d1Query("SELECT is_enabled FROM feature_flags WHERE key = 'airtime_to_cash'", []),
    d1Query(
      `SELECT key, value FROM site_settings
       WHERE key IN ('airtime_to_cash_discount_percent', 'airtime_to_cash_contact_phone', 'airtime_to_cash_contact_email')`,
      [],
    ),
  ])

  // Same default-to-enabled posture as isFeatureEnabled() in
  // src/services/config.ts: a flag row that hasn't been seeded yet
  // should never silently hide a feature nobody explicitly turned off.
  const flagRow = flagResult.results?.[0]
  const enabled = flagRow ? flagRow.is_enabled === 1 : true

  const rows = settingsResult.results ?? []
  const discountPercent = Number(
    rows.find((r: any) => r.key === "airtime_to_cash_discount_percent")?.value ?? "80",
  )
  const contactPhone = rows.find((r: any) => r.key === "airtime_to_cash_contact_phone")?.value ?? ""
  const contactEmail = rows.find((r: any) => r.key === "airtime_to_cash_contact_email")?.value ?? ""

  return NextResponse.json({
    enabled,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 80,
    contactPhone,
    contactEmail,
  })
}
