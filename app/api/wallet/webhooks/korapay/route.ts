// app/api/wallet/webhooks/korapay/route.ts
// Korapay webhook — verifies signature, then credits the wallet.
// Never trust webhook amount blindly without signature verification.
//
// Idempotency: the credit itself is idempotent (wallet.ts, UNIQUE
// reference), so this route does NOT use payment_webhook_events as a
// gate. The event is recorded only AFTER the wallet is credited and all
// side effects applied (see src/services/paymentWebhook.ts). If anything
// throws before that, we return 500 so Korapay retries — the old
// "record first, credit second" order meant a failed credit was never
// retried and the customer was never paid.

import { NextRequest, NextResponse } from "next/server"
import { korapayAdapter } from "@/src/services/providers/payment/korapay"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { extractKorapayFundingSource } from "@/src/services/fundingSource"
import {
  processFundingWebhook,
  recordWebhookEvent,
  isWebhookEventProcessed,
} from "@/src/services/paymentWebhook"

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-korapay-signature") ?? ""

  const credentials = await getPaymentProviderCredentials("korapay")
  const validSignature = korapayAdapter.verifyWebhookSignature(rawBody, signature, credentials)

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const eventId = payload?.data?.reference ?? payload?.data?.id
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

    // This Korapay account is SHARED with Zamorax Marketplace — the same
    // webhook secret fires for both platforms. This check stops
    // ZamoraxPay from ever crediting a wallet based on a Marketplace
    // transaction (or vice versa). Not optional.
    const site = payload?.data?.metadata?.site
    const expectedSite = process.env.NEXT_PUBLIC_SITE_TAG || "zamoraxpay.com.ng"
    if (site !== expectedSite) {
      await recordWebhookEvent("korapay", eventIdStr, eventType, rawBody)
      return NextResponse.json({ received: true, note: "Ignored — belongs to a different site" })
    }

    if (payload?.event === "charge.success" && payload?.data?.status === "success") {
      const userId = payload?.data?.metadata?.userId
      const amountKobo = Math.round((payload?.data?.amount ?? 0) * 100)

      if (userId && amountKobo > 0) {
        await processFundingWebhook({
          provider: "korapay",
          eventId: eventIdStr,
          eventType,
          rawBody,
          userId,
          amountKobo,
          fundingSource: extractKorapayFundingSource(payload),
        })
        return NextResponse.json({ received: true })
      }
    }

    // Nothing to credit (other event type, failed charge, or missing
    // user/amount). Record it so we don't re-inspect it, and ack.
    await recordWebhookEvent("korapay", eventIdStr, eventType, rawBody)
    return NextResponse.json({ received: true })
  } catch (err) {
    // The wallet credit or a money-moving side effect failed. Do NOT
    // record the event, and return 500 so Korapay retries the delivery.
    console.error("[korapay webhook] Processing failed, requesting retry:", eventIdStr, err)
    return NextResponse.json({ error: "Processing failed, please retry" }, { status: 500 })
  }
}
