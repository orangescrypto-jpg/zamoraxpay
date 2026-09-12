// app/api/wallet/webhooks/korapay/route.ts
// Korapay webhook — verifies signature, checks idempotency (has this
// event ID been processed before?), then credits the wallet. Never
// trust webhook amount blindly without signature verification.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { d1Query } from "@/lib/db"
import { korapayAdapter } from "@/src/services/providers/payment/korapay"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { creditWallet } from "@/src/services/wallet"
import { sendWalletFundedEmail } from "@/src/services/email"
import { recordFundingSource, extractKorapayFundingSource } from "@/src/services/fundingSource"
import { awardDepositBonusForFunding } from "@/src/services/depositBonus"
import { applyKorapayChargeForFunding } from "@/src/services/korapayCharge"

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-korapay-signature") ?? ""

  const credentials = await getPaymentProviderCredentials("korapay")
  const validSignature = korapayAdapter.verifyWebhookSignature(rawBody, signature, credentials)

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const eventId = payload?.data?.reference ?? payload?.data?.id

  if (!eventId) {
    return NextResponse.json({ error: "Missing event reference" }, { status: 400 })
  }

  // Idempotency check — has this exact webhook event already been recorded?
  const existing = await d1Query("SELECT id FROM payment_webhook_events WHERE id = ?", [eventId])
  if (existing.results?.length) {
    return NextResponse.json({ received: true, note: "Already processed" })
  }

  await d1Query(
    "INSERT INTO payment_webhook_events (id, provider, event_type, payload) VALUES (?, 'korapay', ?, ?)",
    [eventId, payload?.event ?? "unknown", rawBody],
  )

  // This Korapay account is SHARED with Zamorax Marketplace — the same
  // webhook secret fires for both platforms. This check stops
  // ZamoraxPay from ever crediting a wallet based on a Marketplace
  // transaction (or vice versa). Not optional.
  const site = payload?.data?.metadata?.site
  const expectedSite = process.env.NEXT_PUBLIC_SITE_TAG || "zamoraxpay.com.ng"
  if (site !== expectedSite) {
    return NextResponse.json({ received: true, note: "Ignored — belongs to a different site" })
  }

  if (payload?.event === "charge.success" && payload?.data?.status === "success") {
    const userId = payload?.data?.metadata?.userId
    const amountKobo = Math.round((payload?.data?.amount ?? 0) * 100)

    if (userId && amountKobo > 0) {
      const { newBalanceKobo } = await creditWallet({
        userId,
        amountKobo,
        type: "funding",
        reference: `ZPWF-KORAPAY-${eventId}`,
        providerReference: eventId,
        metadata: { provider: "korapay" },
      })

      // Record which bank account this payment came from, if Korapay's
      // payload exposes it — this is the withdrawal guardrail's source
      // of truth (a user can only withdraw to an account they've funded
      // from before).
      const fundingSource = extractKorapayFundingSource(payload)
      recordFundingSource(userId, "korapay", fundingSource).catch((err) =>
        console.error("[korapay webhook] Funding source recording failed:", err),
      )

      awardDepositBonusForFunding({
        userId,
        depositAmountKobo: amountKobo,
        fundingReference: `ZPWF-KORAPAY-${eventId}`,
      }).catch((err) => console.error("[korapay webhook] Deposit bonus award failed:", err))

      applyKorapayChargeForFunding({
        userId,
        depositAmountKobo: amountKobo,
        fundingReference: `ZPWF-KORAPAY-${eventId}`,
      }).catch((err) => console.error("[korapay webhook] Korapay charge deduction failed:", err))

      const userResult = await d1Query("SELECT email, phone FROM users WHERE id = ?", [userId])
      const user = userResult.results?.[0]
      if (user?.email) {
        sendWalletFundedEmail(user.email, amountKobo / 100, newBalanceKobo / 100).catch((err) =>
          console.error("[korapay webhook] Email failed:", err),
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
