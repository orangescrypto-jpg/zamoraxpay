// app/api/wallet/webhooks/paystack/route.ts
// Paystack webhook — same signature-verification + idempotency pattern
// as the Korapay handler. See src/services/paymentWebhook.ts for why the
// event is recorded AFTER the credit, not before.

import { NextRequest, NextResponse } from "next/server"
import { paystackAdapter } from "@/src/services/providers/payment/paystack"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { extractPaystackFundingSource } from "@/src/services/fundingSource"
import {
  processFundingWebhook,
  recordWebhookEvent,
  isWebhookEventProcessed,
} from "@/src/services/paymentWebhook"

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-paystack-signature") ?? ""

  const credentials = await getPaymentProviderCredentials("paystack")
  const validSignature = paystackAdapter.verifyWebhookSignature(rawBody, signature, credentials)

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const eventId = payload?.data?.reference ?? payload?.data?.id?.toString()
  if (!eventId) {
    return NextResponse.json({ error: "Missing event reference" }, { status: 400 })
  }
  const eventIdStr = String(eventId)
  const eventType = payload?.event ?? "unknown"

  try {
    // Cheap early exit for retries of events that FULLY processed. This
    // is an optimisation only — correctness does not depend on it.
    if (await isWebhookEventProcessed(eventIdStr)) {
      return NextResponse.json({ received: true, note: "Already processed" })
    }

    // Since this Paystack account is SHARED with Zamorax Marketplace, the
    // same webhook secret fires for both platforms' transactions. This
    // check is what keeps ZamoraxPay from ever crediting a wallet based on
    // a Marketplace transaction (or vice versa) — it is not optional.
    const site = payload?.data?.metadata?.site
    const expectedSite = process.env.NEXT_PUBLIC_SITE_TAG || "zamoraxpay.com.ng"
    if (site !== expectedSite) {
      await recordWebhookEvent("paystack", eventIdStr, eventType, rawBody)
      return NextResponse.json({ received: true, note: "Ignored — belongs to a different site" })
    }

    if (payload?.event === "charge.success" && payload?.data?.status === "success") {
      const userId = payload?.data?.metadata?.userId
      const amountKobo = payload?.data?.amount ?? 0

      if (userId && amountKobo > 0) {
        await processFundingWebhook({
          provider: "paystack",
          eventId: eventIdStr,
          eventType,
          rawBody,
          userId,
          amountKobo,
          fundingSource: extractPaystackFundingSource(payload),
        })
        return NextResponse.json({ received: true })
      }
    }

    // Nothing to credit (other event type, failed charge, or missing
    // user/amount). Record it so we don't re-inspect it, and ack.
    await recordWebhookEvent("paystack", eventIdStr, eventType, rawBody)
    return NextResponse.json({ received: true })
  } catch (err) {
    // The wallet credit or a money-moving side effect failed. Do NOT
    // record the event, and return 500 so Paystack retries the delivery.
    console.error("[paystack webhook] Processing failed, requesting retry:", eventIdStr, err)
    return NextResponse.json({ error: "Processing failed, please retry" }, { status: 500 })
  }
}
