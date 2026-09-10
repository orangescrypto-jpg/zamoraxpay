// app/api/vtu/webhooks/vtung/[secret]/route.ts
//
// Receives VTU.ng's async delivery callback. VTU.ng's public docs
// don't clearly pin down whether electricity tokens are always
// returned synchronously in the purchase response, or sometimes
// delivered later via webhook while the order sits in
// "processing-api" (see vtung.ts's docstring on this uncertainty).
// This route exists so that IF VTU.ng calls back, we don't lose the
// token — it's the safety net for the case the purchase-time
// extractDeliveredData() in vtung.ts comes back empty.
//
// URL / AUTH: same two-layer pattern as the Pairgate webhook.
//
// 1) Path secret — VTU.ng's webhook URL (set wherever VTU.ng's
//    dashboard lets you configure a callback URL) should be:
//
//      https://<your-domain>/api/vtu/webhooks/vtung/<VTUNG_WEBHOOK_SECRET>
//
//    Generate VTUNG_WEBHOOK_SECRET yourself (`openssl rand -hex 32`)
//    and set it as an env var. If VTU.ng's dashboard has no field to
//    register a callback URL, this route still works for the future
//    and is a no-op until they call it.
//
// 2) HMAC signature — VTU.ng's public API docs don't document a
//    signing scheme the way Pairgate's do. If VTU.ng adds one later
//    (a header carrying an HMAC of the raw body), set
//    VTUNG_WEBHOOK_SIGNING_SECRET and VTUNG_WEBHOOK_SIGNATURE_HEADER
//    and this route will verify it — same HMAC-SHA256(secret, rawBody)
//    shape most providers use. Until then, verification is skipped
//    and the path secret is the only auth layer, same as Pairgate
//    before its signing secret is configured.
//
// PAYLOAD SHAPE: unconfirmed — VTU.ng's docs describe the purchase
// response shape but not a webhook body. Parsing below is defensive:
// it accepts the same field-name variants vtung.ts's
// extractDeliveredData() already checks for (data.token /
// data.meter_token / json.token, data.units / json.units), plus the
// request_id / reference fields most VTU providers echo back. If the
// real payload differs, the raw body is stored in
// vtu_webhook_events.payload so an admin can inspect it and extend
// extractDeliveredData() below without touching anything else.

import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { d1Query } from "@/lib/d1"
import { getOrderById, attachDeliveredData } from "@/src/services/vtuOrders"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

const MAX_TIMESTAMP_SKEW_SECONDS = 300 // 5 minutes — same window as the Pairgate webhook

function verifyVtungSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  signingSecret: string,
): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader) {
    return { ok: false, reason: "Missing signature header" }
  }

  // Timestamp is optional here (unlike Pairgate) since VTU.ng hasn't
  // documented one — only checked/enforced if actually present.
  if (timestampHeader) {
    const timestamp = Number(timestampHeader)
    if (!Number.isFinite(timestamp)) {
      return { ok: false, reason: "Invalid timestamp header" }
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
      return { ok: false, reason: "Timestamp outside allowed window" }
    }
  }

  const signedPayload = timestampHeader ? `${timestampHeader}.${rawBody}` : rawBody
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
  // purchaseFlow.ts's debitReference, and vtung.ts's buildBody which
  // sends req.internalReference through as request_id) — so we expect
  // VTU.ng to echo back the same value it was given.
  const match = reference.match(/^ZPORD-(.+)$/)
  return match ? match[1] : null
}

function extractDeliveredData(payload: any): VtuDeliveredData | undefined {
  const data = payload?.data ?? payload
  const token = data?.token ?? data?.meter_token ?? payload?.token
  const units = data?.units ?? payload?.units
  if (token || units) {
    return { token: token ?? undefined, units: units != null ? String(units) : undefined }
  }
  return undefined
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  const expectedSecret = process.env.VTUNG_WEBHOOK_SECRET
  if (!expectedSecret) {
    // Misconfiguration, not a client error — fail loudly in logs so
    // it gets fixed, but don't leak that detail to the caller.
    console.error("[vtung webhook] VTUNG_WEBHOOK_SECRET is not set — rejecting all callbacks")
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rawBody = await req.text()

  // HMAC verification — only enforced if you've set a signing secret.
  // See docstring above: VTU.ng doesn't document a signing scheme
  // today, so this is here for if/when they add one.
  const signingSecret = process.env.VTUNG_WEBHOOK_SIGNING_SECRET
  if (signingSecret) {
    const signatureHeaderName = process.env.VTUNG_WEBHOOK_SIGNATURE_HEADER || "x-vtung-signature"
    const timestampHeader = req.headers.get("x-vtung-timestamp")
    const signatureHeader = req.headers.get(signatureHeaderName)
    const verification = verifyVtungSignature(rawBody, timestampHeader, signatureHeader, signingSecret)
    if (!verification.ok) {
      console.error("[vtung webhook] Signature verification failed:", verification.reason)
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
  const reference: string | undefined = data?.request_id ?? payload?.request_id ?? data?.reference ?? payload?.reference
  const eventId: string = reference ?? `vtung-${Date.now()}-${Math.random()}`

  // Idempotency — never double-process the same callback if VTU.ng
  // retries delivery.
  const existing = await d1Query("SELECT id FROM vtu_webhook_events WHERE id = ?", [eventId])
  if (existing.results?.length) {
    return NextResponse.json({ received: true, note: "Already processed" })
  }

  const orderId = extractOrderId(reference)

  await d1Query(
    "INSERT INTO vtu_webhook_events (id, provider, order_id, event_type, payload) VALUES (?, 'vtung', ?, ?, ?)",
    [eventId, orderId, data?.status ?? payload?.status ?? "unknown", rawBody],
  )

  if (!orderId) {
    console.error("[vtung webhook] Could not resolve an order from reference:", reference)
    return NextResponse.json({ received: true, note: "Reference did not match a known order format" })
  }

  const order = await getOrderById(orderId)
  if (!order) {
    console.error("[vtung webhook] No matching order found for id:", orderId)
    return NextResponse.json({ received: true, note: "Order not found" })
  }

  const deliveredData = extractDeliveredData(payload)
  if (deliveredData) {
    await attachDeliveredData(orderId, deliveredData)
  } else {
    console.error(
      "[vtung webhook] Callback received for order",
      orderId,
      "but no token/units found in payload — check vtu_webhook_events.payload for the real field names and extend extractDeliveredData().",
    )
  }

  return NextResponse.json({ received: true })
}
