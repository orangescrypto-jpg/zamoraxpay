// app/api/wallet/fund/reconcile/route.ts
// Abandoned-tab safety net for wallet funding.
//
// The existing fund/verify route only runs when the user lands back
// on /wallet?funding=complete&reference=... — i.e. when Korapay's
// checkout page actually redirects them. If a user closes or abandons
// that tab before the redirect happens (e.g. they pay via bank
// transfer, copy the account number, switch to their banking app, and
// never return to the Korapay tab), nothing on our side ever learns
// the payment succeeded except the webhook. If the webhook is ever
// delayed, dropped, or misconfigured, the user is paid but never
// credited, with no way to recover other than contacting support.
//
// This route is the fix: called on a NORMAL /wallet page load (no
// query params needed), it looks up the signed-in user's own
// unresolved funding attempts from pending_wallet_fundings and
// actively re-verifies each one against Korapay — same underlying
// logic as fund/verify, just not gated behind the redirect.
//
// Cheap to call often: with no pending references, this is a single
// indexed SELECT. Idempotent per the same guarantees as fund/verify
// (creditWallet() is unique on `reference`).

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { listPendingWalletFundings } from "@/src/services/pendingWalletFundings"
import { verifyKorapayFundingAndCredit } from "@/src/services/walletFundingVerification"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const pending = await listPendingWalletFundings(auth.uid)
  if (pending.length === 0) {
    return NextResponse.json({ checked: 0, credited: 0 })
  }

  let creditedCount = 0
  let newBalanceKobo: number | undefined

  // Sequential, not Promise.all: these are rare (a handful at most per
  // user) and each one calls out to Korapay's API — no need to burst
  // several outbound requests at once for what's a background check.
  for (const funding of pending) {
    // Only Korapay has a verify-by-reference path wired up today.
    // Paystack-initiated pending fundings are left for a future pass
    // rather than silently mis-handled here.
    if (funding.provider !== "korapay") continue

    try {
      const result = await verifyKorapayFundingAndCredit(auth.uid, funding.reference, "reconcile-abandoned-tab")
      if (result.status === "success") {
        creditedCount++
        newBalanceKobo = result.newBalanceKobo
      }
    } catch (err) {
      // One bad reference (e.g. a transient Korapay API error) should
      // not stop the rest of the user's pending references from being
      // checked.
      console.error("[wallet/fund/reconcile] Verify failed for reference, continuing:", funding.reference, err)
    }
  }

  return NextResponse.json({ checked: pending.length, credited: creditedCount, newBalanceKobo })
}
