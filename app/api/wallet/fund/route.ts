// app/api/wallet/fund/route.ts
// Initializes a wallet-funding payment. Picks the highest-priority
// enabled payment provider (Korapay first per admin config, falling
// back to Paystack) — never hardcoded here.
//
// Also records the attempt in pending_wallet_fundings BEFORE handing
// the user off to the provider's checkout page. This is what lets
// GET /api/wallet/fund/reconcile (called on a plain /wallet page load,
// not just the funding=complete redirect) find and re-verify a payment
// whose tab the user closed or abandoned before the redirect ever
// happened — see migrations/2026-10-pending-wallet-fundings.sql.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { getActivePaymentProviders, getPaymentProviderCredentials } from "@/src/services/config"
import { getPaymentAdapter } from "@/src/services/providers/payment/registry"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { amountKobo } = await req.json()
    if (!amountKobo || amountKobo < 10000) {
      // Minimum ₦100 funding, matches typical gateway minimums
      return NextResponse.json({ error: "Minimum funding amount is ₦100" }, { status: 400 })
    }

    const userResult = await d1Query("SELECT email, phone, full_name FROM users WHERE id = ?", [auth.uid])
    const user = userResult.results?.[0]
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const providers = await getActivePaymentProviders()
    if (providers.length === 0) {
      return NextResponse.json(
        { error: "No payment provider is currently enabled. Please contact support." },
        { status: 503 },
      )
    }

    const reference = `ZPWF-${randomUUID()}`
    const email = user.email

    // Try providers in priority order until one initializes successfully.
    // (Funding initialization, unlike VTU purchase, is safe to attempt
    // sequentially the same way — no float is spent until the user
    // actually completes payment on the provider's page.)
    for (const provider of providers) {
      const adapter = getPaymentAdapter(provider.providerKey)
      if (!adapter) continue

      const credentials = await getPaymentProviderCredentials(provider.providerKey)
      const result = await adapter.initialize(
        {
          amountKobo,
          email,
          reference,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/wallet?funding=complete&reference=${reference}`,
          metadata: {
            userId: auth.uid,
            // Since Korapay/Paystack are shared with Zamorax Marketplace
            // on the same account, this tag is what lets you filter
            // ZamoraxPay's transactions in the dashboard, and — more
            // importantly — is checked by our webhook handler so a
            // Marketplace event never gets processed as a ZamoraxPay one.
            site: process.env.NEXT_PUBLIC_SITE_TAG || "zamoraxpay.com.ng",
          },
        },
        credentials,
      )

      if (result.success) {
        // Best-effort: if this write fails, the payment can still be
        // completed and credited normally via the webhook or the
        // funding=complete redirect flow — it just won't be eligible
        // for the abandoned-tab reconciliation check below. Never
        // block the user's checkout redirect on this.
        try {
          await d1Query(
            `INSERT INTO pending_wallet_fundings (reference, user_id, provider, amount_kobo, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [reference, auth.uid, provider.providerKey, amountKobo],
          )
        } catch (err) {
          console.error("[wallet/fund] Failed to record pending funding (non-fatal):", reference, err)
        }

        return NextResponse.json({
          provider: provider.providerKey,
          authorizationUrl: result.authorizationUrl,
          reference,
        })
      }
    }

    return NextResponse.json({ error: "Unable to initialize payment with any available provider" }, { status: 502 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Wallet funding failed" }, { status: 500 })
  }
}
