// app/api/admin/providers/vtu/route.ts
// Admin control for the 4 VTU adapters: enable/disable, reorder
// priority (the fallback chain order), and set/rotate API credentials
// — all without a redeploy. Credential writes require super_admin.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, requireSuperAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { updateVtuProviderConfig } from "@/src/services/config"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM vtu_provider_configs ORDER BY priority ASC")
  const providers = (result.results ?? []).map((r: any) => ({
    providerKey: r.provider_key,
    label: r.label,
    isEnabled: r.is_enabled === 1,
    priority: r.priority,
    supportsServices: JSON.parse(r.supports_services ?? "[]"),
    hasCredentials: !!r.credentials_json,
    lastHealthStatus: r.last_health_status,
    successRatePct: r.success_rate_pct,
  }))

  return NextResponse.json({ providers })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { providerKey, isEnabled, priority, credentials } = body

    if (!providerKey) return NextResponse.json({ error: "providerKey is required" }, { status: 400 })

    // Credential changes are sensitive — require super_admin. Toggling
    // enable/disable or reordering priority only requires regular admin.
    const auth = credentials !== undefined ? await requireSuperAdmin(req) : await requireAdmin(req)
    if (!auth.ok) return auth.error

    await updateVtuProviderConfig(providerKey, { isEnabled, priority, credentials }, auth.uid)

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, after_json)
       VALUES (?, ?, 'vtu_provider_config.update', 'vtu_provider_configs', ?, ?)`,
      [
        randomUUID(),
        auth.uid,
        providerKey,
        JSON.stringify({ isEnabled, priority, credentialsChanged: credentials !== undefined }),
      ],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
