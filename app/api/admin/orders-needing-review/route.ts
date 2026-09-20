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
import { requireStaff } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

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
