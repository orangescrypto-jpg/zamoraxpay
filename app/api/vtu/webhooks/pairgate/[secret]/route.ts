// app/api/vtu/webhooks/pairgate/[secret]/route.ts
//
// Receives Pairgate's async delivery callback for exam_pin and
// electricity purchases (see pairgate.ts's docstring: those two
// service types deliver the PIN/token AFTER the purchase call
// returns, via webhook — this is that webhook).
//
// URL / AUTH: Pairgate's public docs (as reflected in our own adapter
// file) don't document an HMAC/signature scheme for webhooks, unlike
// Paystack/Korapay. The safe fallback when a provider only lets you
// register a plain callback URL with no signing support is a secret
// token embedded IN THE URL PATH ITSELF, checked before anything else
// runs — that's the [secret] segment below. Give Pairgate this exact
// URL in their dashboard/API config:
//
//   https://<your-domain>/api/vtu/webhooks/pairgate/<PAIRGATE_WEBHOOK_SECRET>
//
// e.g. https://zamoraxpay.com.ng/api/vtu/webhooks/pairgate/a1b2c3d4e5f6...
//
// Generate PAIRGATE_WEBHOOK_SECRET yourself (a long random string —
// `openssl rand -hex 32` works well) and set it as an env var. Because
// it's inside the path, anyone without it gets a 401 before we parse
// or trust anything in the request body — this is NOT a substitute
// for a real HMAC signature if Pairgate's dashboard/docs turn out to
// expose one; if you find a signing secret in your Pairgate account
// settings, prefer that and verify it here in addition to (or instead
// of) the path token.
//
// PAYLOAD SHAPE: also not pinned down by public docs the way
// Paystack/Korapay's are, so this reads defensively across the
// plausible field names (reference/reference_code, status, and the
// same pins/token shapes the adapter's checkStatus already guesses
// at) and logs the full raw payload either way so nothing is lost if
// the real shape differs — check vtu_webhook_events.payload by hand
// the first time a real callback arrives and extend the parsing below
// if the field names don't match.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/d1"
import { getOrderById, attachDeliveredData } from "@/src/services/vtuOrders"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

function extractOrderId(reference: unknown): string | null {
  if (typeof reference !== "string") return null
  // Our own internal reference format is "ZPORD-<orderId>" (see
  // purchaseFlow.ts's debitReference) — Pairgate echoes back
  // whatever `reference` we sent on the original purchase call.
  const match = reference.match(/^ZPORD-(.+)$/)
  return match ? match[1] : null
}

function extractDeliveredData(payload: any): VtuDeliveredData | undefined {
  const data = payload?.data ?? payload

  if (Array.isArray(data?.pins) && data.pins.length > 0) {
    return {
      pins: data.pins.map((p: any) =>
        typeof p === "string" ? { pin: p } : { pin: p.pin ?? p.Pin, serialNumber: p.serial ?? p.Serial },
      ),
    }
  }
  if (data?.token) {
    return { token: data.token, units: data.units != null ? String(data.units) : undefined }
  }
  return undefined
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  const expectedSecret = process.env.PAIRGATE_WEBHOOK_SECRET
  if (!expectedSecret) {
    // Misconfiguration, not a client error — fail loudly in logs so
    // it gets fixed, but don't leak that detail to the caller.
    console.error("[pairgate webhook] PAIRGATE_WEBHOOK_SECRET is not set — rejecting all callbacks")
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
  const reference: string | undefined = data?.reference ?? data?.reference_code ?? payload?.reference
  const eventId: string =
    data?.reference_code ?? data?.transaction_id ?? reference ?? `pairgate-${Date.now()}-${Math.random()}`

  // Idempotency — Pairgate (like most providers) may retry a webhook
  // delivery; never double-process the same event.
  const existing = await d1Query("SELECT id FROM vtu_webhook_events WHERE id = ?", [eventId])
  if (existing.results?.length) {
    return NextResponse.json({ received: true, note: "Already processed" })
  }

  const orderId = extractOrderId(reference)

  await d1Query(
    "INSERT INTO vtu_webhook_events (id, provider, order_id, event_type, payload) VALUES (?, 'pairgate', ?, ?, ?)",
    [eventId, orderId, payload?.event ?? data?.status ?? "unknown", rawBody],
  )

  if (!orderId) {
    console.error("[pairgate webhook] Could not resolve an order from reference:", reference)
    return NextResponse.json({ received: true, note: "Reference did not match a known order format" })
  }

  const order = await getOrderById(orderId)
  if (!order) {
    console.error("[pairgate webhook] No matching order found for id:", orderId)
    return NextResponse.json({ received: true, note: "Order not found" })
  }

  const deliveredData = extractDeliveredData(payload)
  if (deliveredData) {
    await attachDeliveredData(orderId, deliveredData)
  } else {
    console.error(
      "[pairgate webhook] Callback received for order",
      orderId,
      "but no pins/token found in payload — check vtu_webhook_events.payload for the real field names and extend extractDeliveredData().",
    )
  }

  return NextResponse.json({ received: true })
}
