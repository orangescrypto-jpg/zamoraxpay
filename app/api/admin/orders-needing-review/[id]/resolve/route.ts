// app/api/admin/orders-needing-review/[id]/resolve/route.ts
// Manual resolution for an order orphanedOrders.ts flagged
// NEEDS_REVIEW (see that file's docstring — it never auto-refunds on
// silence/uncertainty, so these sit here until an admin checks the
// provider's own dashboard for the order's reference and decides).
//
// Money-moving / customer-facing action — requireAdmin, not
// requireStaff, same split as /api/admin/withdrawals/[id]/approve.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { resolvePendingOrder } from "@/src/services/vtuOrders"
import { refundWallet } from "@/src/services/wallet"
import { awardCashbackForOrder } from "@/src/services/cashback"
import { maybeAwardReferralBonus } from "@/src/services/referral"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params

  try {
    const { outcome, note } = await req.json()
    // outcome: 'delivered' | 'failed_refund'
    // note: admin's free-text record of what they found on the
    // provider's dashboard — stored in failure_reason either way, so
    // the decision has a paper trail.

    const orderResult = await d1Query("SELECT * FROM vtu_orders WHERE id = ?", [id])
    const order = orderResult.results?.[0]
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
    if (order.status !== "pending") {
      return NextResponse.json({ error: `Order is already ${order.status}` }, { status: 400 })
    }
    if (!String(order.failure_reason ?? "").startsWith("NEEDS_REVIEW:")) {
      return NextResponse.json({ error: "This order isn't flagged for review" }, { status: 400 })
    }

    if (outcome === "delivered") {
      // Admin confirmed on the provider's dashboard that this was
      // actually delivered — mark success, no refund, award the
      // rewards the customer would have gotten normally.
      await resolvePendingOrder(id, {
        status: "success",
        failureReason: `Manually confirmed delivered by admin${note ? `: ${note}` : ""}`,
      })
      await awardCashbackForOrder({
        userId: order.user_id,
        orderId: id,
        purchaseAmountKobo: order.amount_kobo,
      }).catch((err) => console.error("[orders-needing-review] cashback failed:", id, err))
      await maybeAwardReferralBonus(order.user_id).catch((err) =>
        console.error("[orders-needing-review] referral failed:", id, err),
      )
      return NextResponse.json({ success: true, message: "Order marked delivered. No refund issued." })
    }

    if (outcome === "failed_refund") {
      // Same reference format the automated recovery path uses
      // (ZPREF-<orderId>) — creditWallet's unique-reference guard makes
      // a double refund a no-op if this order was somehow already
      // refunded another way.
      await refundWallet({
        userId: order.user_id,
        amountKobo: order.amount_kobo,
        reference: `ZPREF-${id}`,
        relatedOrderId: id,
      })
      await resolvePendingOrder(id, {
        status: "failed",
        failureReason: `Manually confirmed not delivered by admin, wallet refunded${note ? `: ${note}` : ""}`,
      })
      return NextResponse.json({ success: true, message: "Order marked failed. Wallet refunded." })
    }

    return NextResponse.json({ error: "outcome must be 'delivered' or 'failed_refund'" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Resolution failed" }, { status: 500 })
  }
}
