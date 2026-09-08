// app/api/admin/feature-flags/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { getFeatureFlags, setFeatureFlag } from "@/src/services/config"
import { d1Query } from "@/lib/db"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const flags = await getFeatureFlags()
  return NextResponse.json({ flags })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { key, isEnabled } = await req.json()
    if (!key || typeof isEnabled !== "boolean") {
      return NextResponse.json({ error: "key and isEnabled (boolean) are required" }, { status: 400 })
    }

    const before = await d1Query("SELECT is_enabled FROM feature_flags WHERE key = ?", [key])
    await setFeatureFlag(key, isEnabled, auth.uid)

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'feature_flag.toggle', 'feature_flags', ?, ?, ?)`,
      [randomUUID(), auth.uid, key, JSON.stringify(before.results?.[0]), JSON.stringify({ is_enabled: isEnabled })],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
