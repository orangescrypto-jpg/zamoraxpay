// app/api/wallet/webhooks/paystack/route.ts
// Paystack webhook — same idempotency + signature-verification pattern
// as the Korapay handler.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/db"
import { paystackAdapter } from "@/src/services/providers/payment/paystack"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { creditWallet } from "@/src/services/wallet"
import { sendWalletFundedEmail } from "@/src/services/email"
import { recordFundingSource, extractPaystackFundingSource } from "@/src/services/fundingSource"

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-paystack-signature") ?? ""

  const credentials = await getPaymentProviderCredentials("paystack")
  const validSignature = paystackAdapter.verifyWebhookSignature(rawBody, signature, credentials)

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const eventId = payload?.data?.reference ?? payload?.data?.id?.toString()

  if (!eventId) {
    return NextResponse.json({ error: "Missing event reference" }, { status: 400 })
  }

  const existing = await d1Query("SELECT id FROM payment_webhook_events WHERE id = ?", [eventId])
  if (existing.results?.length) {
    return NextResponse.json({ received: true, note: "Already processed" })
  }

  await d1Query(
    "INSERT INTO payment_webhook_events (id, provider, event_type, payload) VALUES (?, 'paystack', ?, ?)",
    [eventId, payload?.event ?? "unknown", rawBody],
  )

  // Since this Paystack account is SHARED with Zamorax Marketplace, the
  // same webhook secret fires for both platforms' transactions. This
  // check is what keeps ZamoraxPay from ever crediting a wallet based on
  // a Marketplace transaction (or vice versa) — it is not optional.
  const site = payload?.data?.metadata?.site
  const expectedSite = process.env.NEXT_PUBLIC_SITE_TAG || "zamoraxpay.com.ng"
  if (site !== expectedSite) {
    return NextResponse.json({ received: true, note: "Ignored — belongs to a different site" })
  }

  if (payload?.event === "charge.success" && payload?.data?.status === "success") {
    const userId = payload?.data?.metadata?.userId
    const amountKobo = payload?.data?.amount ?? 0

    if (userId && amountKobo > 0) {
      const { newBalanceKobo } = await creditWallet({
        userId,
        amountKobo,
        type: "funding",
        reference: `ZPWF-PAYSTACK-${eventId}`,
        providerReference: eventId,
        metadata: { provider: "paystack" },
      })

      // Record which bank account this payment came from, if Paystack's
      // payload exposes it — this is the withdrawal guardrail's source
      // of truth (a user can only withdraw to an account they've funded
      // from before).
      const fundingSource = extractPaystackFundingSource(payload)
      recordFundingSource(userId, "paystack", fundingSource).catch((err) =>
        console.error("[paystack webhook] Funding source recording failed:", err),
      )

      const userResult = await d1Query("SELECT email, phone FROM users WHERE id = ?", [userId])
      const user = userResult.results?.[0]
      if (user?.email) {
        sendWalletFundedEmail(user.email, amountKobo / 100, newBalanceKobo / 100).catch((err) =>
          console.error("[paystack webhook] Email failed:", err),
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
