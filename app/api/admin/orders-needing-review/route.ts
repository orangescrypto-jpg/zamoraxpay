// app/api/admin/orders-needing-review/route.ts
// Admin queue for VTU orders orphanedOrders.ts couldn't resolve on its
// own — flagged with failure_reason = 'NEEDS_REVIEW: ...' (see
// src/services/orphanedOrders.ts:flagForAdmin). Until now these only
// showed up as a count in the reconcile-orphaned-orders cron response
// (needsAdminReview) — there was no page to see WHICH orders, so an
// admin could never actually act on them. This route + the
// /admin/orders-needing-review page fix that.
//
// Staff (moderator+) can view; resolving is a money-moving action
// (refund) or at minimum a customer-facing status change, so it
// requires admin — same split as /api/admin/withdrawals.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireStaff, requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getCronSecret } from "@/src/services/siteSettings"
import { GET as reconcileOrphanedOrdersCron } from "@/app/api/cron/reconcile-orphaned-orders/route"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100")

  const result = await d1Query(
    `SELECT o.id, o.user_id, o.service_type, o.network_or_biller, o.recipient, o.amount_kobo,
            o.provider_attempts, o.failure_reason, o.created_at,
            u.full_name, u.email, u.phone
       FROM vtu_orders o
       JOIN users u ON u.id = o.user_id
      WHERE o.status = 'pending' AND o.failure_reason LIKE 'NEEDS_REVIEW:%'
      ORDER BY o.created_at ASC
      LIMIT ?`,
    [limit],
  )

  return NextResponse.json({ orders: result.results ?? [] })
}

// POST { runSweep: true } — new. Admin manual-trigger gap: this page
// already let an admin resolve individually-flagged orders (see
// [id]/resolve/route.ts), but there was no "run the sweep now" button
// distinct from that — i.e. no way to manually re-run the whole
// reconcile-orphaned-orders cron sweep itself. Same in-process
// cron-GET-handler pattern as the other admin trigger routes added
// alongside it. Note: reconcile-orphaned-orders is intentionally
// sequential internally (provider 429 avoidance) — this route does not
// change that, it only exposes a manual way to invoke it.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json().catch(() => ({}))
    if (body?.runSweep !== true) {
      return NextResponse.json({ error: "Expected { runSweep: true }" }, { status: 400 })
    }

    const secret = (await getCronSecret()) || process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: "Cron secret is not configured; cannot run this job." }, { status: 500 })
    }

    const cronReq = new NextRequest(new URL("/api/cron/reconcile-orphaned-orders", req.url), {
      headers: { authorization: `Bearer ${secret}` },
    })
    const cronRes = await reconcileOrphanedOrdersCron(cronReq)
    const result = await cronRes.json()

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'reconcile_orphaned_orders.manual_run', 'vtu_orders', NULL, NULL, ?)`,
      [randomUUID(), auth.uid, JSON.stringify(result)],
    )

    return NextResponse.json(result, { status: cronRes.status })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sweep run failed" }, { status: 500 })
  }
}
