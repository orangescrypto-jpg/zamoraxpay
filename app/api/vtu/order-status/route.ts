// app/api/vtu/order-status/route.ts
// NEW: lightweight single-order status lookup for the client's
// purchase-status polling (audit finding: "no live transaction status
// — a stuck order shows an amber 'pending' chip forever until a manual
// refresh").
//
// GET /api/vtu/order-status?id=<orderId>
//   -> { status, failureReason, deliveredData, amountKobo, serviceType }
//
// Scoped to the caller's own orders (user_id = auth.uid) — an order id
// belonging to anyone else 404s. Kept deliberately tiny: no joins, no
// history pagination machinery, one indexed primary-key read, so it can
// be polled every few seconds cheaply while a purchase is pending.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 })
  }

  const result = await d1Query(
    `SELECT id, status, failure_reason, delivered_data, amount_kobo, service_type,
            network_or_biller, recipient, provider_reference
     FROM vtu_orders WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, auth.uid],
  )

  const order = result.results?.[0]
  if (!order) {
    // Not found OR not the caller's order — same response either way so
    // order ids can't be probed across accounts.
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  // delivered_data is a JSON TEXT column; parse defensively (a malformed
  // value should never break the status poll).
  let deliveredData: unknown = null
  if (order.delivered_data) {
    try {
      deliveredData = JSON.parse(order.delivered_data as string)
    } catch {
      deliveredData = null
    }
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    failureReason: order.failure_reason ?? null,
    deliveredData,
    amountKobo: order.amount_kobo,
    serviceType: order.service_type,
    networkOrBiller: order.network_or_biller,
    recipient: order.recipient,
    providerReference: order.provider_reference ?? null,
  })
}
