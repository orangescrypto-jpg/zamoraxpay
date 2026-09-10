// app/api/wallet/fund/verify/route.ts
// Safety net for wallet funding. The Korapay webhook is the primary
// path that credits a wallet, but webhooks can arrive a few seconds
// after the user is redirected back — or, less commonly, may not
// arrive at all (misconfigured URL, dropped request, etc). This route
// lets the frontend actively confirm a payment on return and credit
// the wallet itself if the webhook hasn't landed yet.
//
// Safe to call repeatedly: creditWallet() is idempotent per
// `reference`, and this uses the exact same reference format the
// Korapay webhook uses, so this never double-credits a payment the
// webhook already processed (and vice versa).

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { korapayAdapter } from "@/src/services/providers/payment/korapay"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { creditWallet } from "@/src/services/wallet"
import { recordFundingSource, extractKorapayFundingSource } from "@/src/services/fundingSource"
import { awardDepositBonusForFunding } from "@/src/services/depositBonus"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const reference = req.nextUrl.searchParams.get("reference")
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 })
  }

  const credentials = await getPaymentProviderCredentials("korapay")
  const result = await korapayAdapter.verify(reference, credentials)

  if (result.status === "pending") {
    return NextResponse.json({ status: "pending" })
  }

  if (result.status === "failed" || !result.success) {
    return NextResponse.json({ status: "failed" })
  }

  if (!result.amountKobo) {
    return NextResponse.json({ status: "pending" })
  }

  const eventReference = `ZPWF-KORAPAY-${result.providerReference ?? reference}`

  const { newBalanceKobo } = await creditWallet({
    userId: auth.uid,
    amountKobo: result.amountKobo,
    type: "funding",
    reference: eventReference,
    providerReference: result.providerReference ?? reference,
    metadata: { provider: "korapay", source: "verify-on-return" },
  })

  // Same guardrail-source recording the webhook does — without this,
  // a payment confirmed via this fallback path (rather than the
  // webhook) would leave the user with a credited balance but no
  // eligible withdrawal account on file.
  const fundingSource = extractKorapayFundingSource(result.raw)
  recordFundingSource(auth.uid, "korapay", fundingSource).catch((err) =>
    console.error("[wallet/fund/verify] Funding source recording failed:", err),
  )

  awardDepositBonusForFunding({
    userId: auth.uid,
    depositAmountKobo: result.amountKobo,
    fundingReference: eventReference,
  }).catch((err) => console.error("[wallet/fund/verify] Deposit bonus award failed:", err))

  return NextResponse.json({ status: "success", newBalanceKobo })
}
