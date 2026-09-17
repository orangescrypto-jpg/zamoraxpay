// app/api/admin/cron-secret/route.ts
// Deliberately separate from /api/admin/settings: this endpoint is
// write-only (PATCH only, no GET) so the current secret value can
// never be fetched back to the browser once set.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { setCronSecret } from "@/src/services/siteSettings"

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { value } = await req.json()
    if (!value || typeof value !== "string" || value.length < 24) {
      return NextResponse.json(
        { error: "value is required and must be at least 24 characters" },
        { status: 400 },
      )
    }

    await setCronSecret(value, auth.uid)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
