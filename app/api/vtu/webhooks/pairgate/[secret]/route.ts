// app/api/vtu/webhooks/pairgate/[secret]/route.ts
//
// Receives Pairgate's async delivery callback for exam_pin and
// electricity purchases (see pairgate.ts's docstring: those two
// service types deliver the PIN/token AFTER the purchase call
// returns, via webhook — this is that webhook).
//
// URL / AUTH: two layers.
//
// 1) Path secret — Pairgate's webhook URL is registered with a secret
//    segment, checked before anything else runs:
//
//      https://<your-domain>/api/vtu/webhooks/pairgate/<PAIRGATE_WEBHOOK_SECRET>
//
//    Generate PAIRGATE_WEBHOOK_SECRET yourself (`openssl rand -hex 32`)
//    and set it as an env var.
//
// 2) HMAC signature — Pairgate's dashboard has an optional "Webhook
//    Verification" toggle (see https://pairgate.com/developers/webhooks).
//    When enabled, Pairgate sends X-Pairgate-Timestamp and
//    X-Pairgate-Signature headers, computed as:
//
//      signature = HMAC_SHA256(key = webhook secret, message = timestamp + "." + rawBody)
//
//    hex-encoded. Turn verification ON in the dashboard, copy the
//    secret shown (only shown once) into PAIRGATE_WEBHOOK_SIGNING_SECRET,
//    and this route will verify it below — rejecting unsigned or
//    stale (>5 min old) requests once that env var is set. If it's
//    not set, we fall back to path-secret-only auth, so verification
//    is opt-in as you roll it out.
//
// PAYLOAD SHAPE: documented at the URL above. Confirmed fields:
// event, reference (client ref, often null), reference_code, status
// ("successful"/"failed"), message, plan/item, recipient, amount,
// pin (electricity/education only), completed_at. Parsing below reads
// defensively across a couple of historical field-name variants too.

import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { d1Query } from "@/lib/d1"
import { getOrderById, attachDeliveredData } from "@/src/services/vtuOrders"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

const MAX_TIMESTAMP_SKEW_SECONDS = 300 // 5 minutes, per Pairgate's docs

function verifyPairgateSignature(rawBody: string, timestampHeader: string | null, signatureHeader: string | null, signingSecret: string): { ok: true } | { ok: false; reason: string } {
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: "Missing signature headers" }
  }

  const timestamp = Number(timestampHeader)
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "Invalid timestamp header" }
  }
  if (Math.abs(Date.now() / 1000 - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: "Timestamp outside allowed window" }
  }

  const signedPayload = `${timestampHeader}.${rawBody}`
  const expectedSignature = createHmac("sha256", signingSecret).update(signedPayload).digest("hex")

  const expectedBuf = Buffer.from(expectedSignature, "utf8")
  const providedBuf = Buffer.from(signatureHeader, "utf8")
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: "Signature mismatch" }
  }

  return { ok: true }
}

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

  // HMAC verification — only enforced once you've turned on "Webhook
  // Verification" in the Pairgate dashboard and set the secret it gives
  // you here. Until then this step is skipped and the path secret above
  // is your only auth layer.
  const signingSecret = process.env.PAIRGATE_WEBHOOK_SIGNING_SECRET
  if (signingSecret) {
    const timestampHeader = req.headers.get("x-pairgate-timestamp")
    const signatureHeader = req.headers.get("x-pairgate-signature")
    const verification = verifyPairgateSignature(rawBody, timestampHeader, signatureHeader, signingSecret)
    if (!verification.ok) {
      console.error("[pairgate webhook] Signature verification failed:", verification.reason)
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

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
