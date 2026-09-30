// app/api/vtu/webhooks/inlomax/[secret]/route.ts
//
// Receives Inlomax's async delivery callback. Confirmed payload shape
// from https://inlomax.com/docs/webhook (same envelope as every
// Inlomax purchase response):
//
//   {
//     "status": "success",
//     "message": "...",
//     "data": {
//       "type": "data" | "airtime" | "cable" | "electricity" | "education",
//       "reference": "INL|...",   // echoes our own request-id we sent
//       "amount": 1000,
//       "status": "success",
//       "token": "..."            // electricity only
//       "pins": [...]             // education only
//     }
//   }
//
// URL / AUTH: Inlomax's own docs don't describe a signature/HMAC
// scheme, only that the webhook URL is registered on the dashboard
// (see the Developer's API page from your screenshot) — so this
// route relies on the same path-secret pattern as the Pairgate/VTU.ng
// webhook routes:
//
//   https://<your-domain>/api/vtu/webhooks/inlomax/<INLOMAX_WEBHOOK_SECRET>
//
// Generate INLOMAX_WEBHOOK_SECRET yourself (`openssl rand -hex 32`),
// set it as an env var, then paste the full URL above (with that
// secret in place of the placeholder) into the "Webhook URL" field on
// inlomax.com/app/developer.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/d1"
import { getOrderById, attachDeliveredData } from "@/src/services/vtuOrders"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

function extractOrderId(reference: unknown): string | null {
  if (typeof reference !== "string") return null
  // Our own internal reference format is "ZPORD-<orderId>" (see
  // purchaseFlow.ts's debitReference) — Inlomax echoes back whatever
  // "request-id" we sent on the original purchase call, as data.reference.
  const match = reference.match(/^ZPORD-(.+)$/)
  return match ? match[1] : null
}

function extractDeliveredData(payload: any): VtuDeliveredData | undefined {
  const data = payload?.data ?? payload

  if (data?.type === "education" && Array.isArray(data?.pins)) {
    return {
      pins: data.pins.map((p: any) => ({
        pin: String(p.pin).trim(),
        serialNumber: p.serialNo ?? p.serialNumber,
      })),
    }
  }
  if (data?.type === "electricity" && data?.token) {
    return { token: String(data.token), units: data.units != null ? String(data.units) : undefined }
  }
  return undefined
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  const expectedSecret = process.env.INLOMAX_WEBHOOK_SECRET
  if (!expectedSecret) {
    // Misconfiguration, not a client error — fail loudly in logs so
    // it gets fixed, but don't leak that detail to the caller.
    console.error("[inlomax webhook] INLOMAX_WEBHOOK_SECRET is not set — rejecting all callbacks")
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rawBody = await req.text()

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const data = payload?.data ?? payload
  const reference: string | undefined = data?.reference ?? payload?.reference
  const eventId: string = reference ?? `inlomax-${Date.now()}-${Math.random()}`

  // Idempotency — Inlomax (like most providers) may retry a webhook
  // delivery; never double-process the same event.
  const existing = await d1Query("SELECT id FROM vtu_webhook_events WHERE id = ?", [eventId])
  if (existing.results?.length) {
    return NextResponse.json({ received: true, note: "Already processed" })
  }

  const orderId = extractOrderId(reference)
  const eventType = data?.type ?? data?.status ?? payload?.status ?? "unknown"

  // Record the idempotency row only AFTER processing succeeds (or
  // after we've determined there's genuinely nothing to process — no
  // resolvable order). If we recorded it up front and
  // attachDeliveredData below then threw, the event would already
  // read as "processed" and Inlomax's retry — the only other chance
  // to capture the pin/token — would be silently swallowed by the
  // idempotency check above. Recording after success means a failed
  // attempt leaves no row, so a retry is free to try again.
  async function recordEvent() {
    await d1Query(
      "INSERT INTO vtu_webhook_events (id, provider, order_id, event_type, payload) VALUES (?, 'inlomax', ?, ?, ?)",
      [eventId, orderId, eventType, rawBody],
    )
  }

  if (!orderId) {
    console.error("[inlomax webhook] Could not resolve an order from reference:", reference)
    await recordEvent()
    return NextResponse.json({ received: true, note: "Reference did not match a known order format" })
  }

  const order = await getOrderById(orderId)
  if (!order) {
    console.error("[inlomax webhook] No matching order found for id:", orderId)
    await recordEvent()
    return NextResponse.json({ received: true, note: "Order not found" })
  }

  const deliveredData = extractDeliveredData(payload)
  if (deliveredData) {
    // Let this throw on failure — if attaching the delivered data
    // fails, we must NOT record the event as processed, or Inlomax's
    // retry will be dropped by the idempotency check and the
    // pin/token lost for good.
    await attachDeliveredData(orderId, deliveredData)
  } else {
    console.error(
      "[inlomax webhook] Callback received for order",
      orderId,
      "but no pin/token found in payload — check vtu_webhook_events.payload for the real field names and extend extractDeliveredData().",
    )
  }

  await recordEvent()
  return NextResponse.json({ received: true })
}
