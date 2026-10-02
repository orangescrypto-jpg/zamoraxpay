// app/api/admin/auto-reload/route.ts
// New file. Admin manual-trigger gap: this project had no admin UI at
// all for auto-reload. Same in-process cron-GET-handler pattern as
// app/api/admin/reconcile-pending-orders/route.ts, since auto-reload
// also only exists as a cron route export, not a standalone service
// function — no sweep/debit/purchase logic is duplicated here.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getCronSecret } from "@/src/services/siteSettings"
import { GET as autoReloadCron } from "@/app/api/cron/auto-reload/route"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const secret = (await getCronSecret()) || process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: "Cron secret is not configured; cannot run this job." }, { status: 500 })
    }

    const cronReq = new NextRequest(new URL("/api/cron/auto-reload", req.url), {
      headers: { authorization: `Bearer ${secret}` },
    })
    const cronRes = await autoReloadCron(cronReq)
    const result = await cronRes.json()

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'auto_reload.manual_run', 'auto_reload_rules', NULL, NULL, ?)`,
      [randomUUID(), auth.uid, JSON.stringify(result)],
    )

    return NextResponse.json(result, { status: cronRes.status })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Auto-reload run failed" }, { status: 500 })
  }
}
