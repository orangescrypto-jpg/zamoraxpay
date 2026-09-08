// app/api/whatsapp-support/route.ts
// Public route — the floating WhatsApp button reads its on/off state
// and number from here. No auth required; these two values are meant
// to be visible to any visitor.

import { NextResponse } from "next/server"
import { d1Query } from "@/lib/db"

export async function GET() {
  const result = await d1Query(
    "SELECT key, value FROM site_settings WHERE key IN ('whatsapp_support_enabled', 'whatsapp_support_number')",
    [],
  )
  const rows = result.results ?? []
  const enabled = rows.find((r: any) => r.key === "whatsapp_support_enabled")?.value === "true"
  const number = rows.find((r: any) => r.key === "whatsapp_support_number")?.value ?? ""

  return NextResponse.json({ enabled: enabled && number.length > 0, number })
}
