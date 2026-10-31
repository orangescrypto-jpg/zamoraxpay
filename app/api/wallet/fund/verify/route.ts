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
//
// Only covers the case where the user actually returns to
// /wallet?funding=complete&reference=... — see
// app/api/wallet/fund/reconcile/route.ts for the case where the user
// closes/abandons the checkout tab and never comes back to that URL
// at all. Both share the same verify-and-credit logic in
// src/services/walletFundingVerification.ts.

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { verifyKorapayFundingAndCredit } from "@/src/services/walletFundingVerification"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const reference = req.nextUrl.searchParams.get("reference")
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 })
  }

  const result = await verifyKorapayFundingAndCredit(auth.uid, reference, "verify-on-return")
  return NextResponse.json(result)
}
