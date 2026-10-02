// app/api/admin/reconcile-pending-orders/route.ts
// New file. Admin manual-trigger gap: this project had no admin UI at
// all for the pending-orders reconciliation sweep. Unlike
// re-engagement, this job only exists as a cron route export (no
// standalone service function to call directly), so this calls the
// cron route's own exported GET handler in-process — constructing a
// NextRequest carrying the same Bearer-secret header verifyCronAuth()
// checks, via getCronSecret() from src/services/siteSettings.ts, so
// no sweep logic is duplicated here.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getCronSecret } from "@/src/services/siteSettings"
import { GET as reconcilePendingOrdersCron } from "@/app/api/cron/reconcile-pending-orders/route"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const secret = (await getCronSecret()) || process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: "Cron secret is not configured; cannot run this job." }, { status: 500 })
    }

    const cronReq = new NextRequest(new URL("/api/cron/reconcile-pending-orders", req.url), {
      headers: { authorization: `Bearer ${secret}` },
    })
    const cronRes = await reconcilePendingOrdersCron(cronReq)
    const result = await cronRes.json()

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'reconcile_pending_orders.manual_run', 'vtu_orders', NULL, NULL, ?)`,
      [randomUUID(), auth.uid, JSON.stringify(result)],
    )

    return NextResponse.json(result, { status: cronRes.status })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reconcile run failed" }, { status: 500 })
  }
}
