// src/services/walletFundingVerification.ts
// Shared "actively verify a Korapay charge and credit the wallet if
// it succeeded" logic, extracted so it can be called from two places
// without duplicating it:
//   1. app/api/wallet/fund/verify/route.ts — the existing redirect-
//      triggered verify-on-return flow (user actually landed back on
//      /wallet?funding=complete&reference=...).
//   2. app/api/wallet/fund/reconcile/route.ts — the new abandoned-tab
//      safety net, triggered by a plain /wallet page load, for
//      payments whose redirect never happened at all.
//
// Idempotent: creditWallet() enforces uniqueness on `reference`
// (wallet_transactions.reference UNIQUE), so calling this twice for
// the same underlying payment — from verify, from reconcile, or from
// the webhook — can only ever credit the wallet once.

import { korapayAdapter } from "@/src/services/providers/payment/korapay"
import { getPaymentProviderCredentials } from "@/src/services/config"
import { creditWallet } from "@/src/services/wallet"
import { recordFundingSource, extractKorapayFundingSource } from "@/src/services/fundingSource"
import { awardDepositBonusForFunding } from "@/src/services/depositBonus"
import { applyKorapayChargeForFunding } from "@/src/services/korapayCharge"
import { resolvePendingWalletFunding } from "@/src/services/pendingWalletFundings"

export type VerifyAndCreditResult =
  | { status: "pending" }
  | { status: "failed" }
  | { status: "success"; newBalanceKobo: number }

export async function verifyKorapayFundingAndCredit(
  userId: string,
  reference: string,
  source: "verify-on-return" | "reconcile-abandoned-tab",
): Promise<VerifyAndCreditResult> {
  const credentials = await getPaymentProviderCredentials("korapay")
  const result = await korapayAdapter.verify(reference, credentials)

  if (result.status === "pending") {
    return { status: "pending" }
  }

  if (result.status === "failed" || !result.success) {
    return { status: "failed" }
  }

  if (!result.amountKobo) {
    return { status: "pending" }
  }

  const eventReference = `ZPWF-KORAPAY-${result.providerReference ?? reference}`

  const { newBalanceKobo } = await creditWallet({
    userId,
    amountKobo: result.amountKobo,
    type: "funding",
    reference: eventReference,
    providerReference: result.providerReference ?? reference,
    metadata: { provider: "korapay", source },
  })

  // Best-effort side effects — none of these should block the credit
  // itself, which already succeeded above.
  resolvePendingWalletFunding(reference).catch((err) =>
    console.error(`[${source}] Failed to mark pending funding resolved (non-fatal):`, reference, err),
  )

  const fundingSource = extractKorapayFundingSource(result.raw)
  recordFundingSource(userId, "korapay", fundingSource).catch((err) =>
    console.error(`[${source}] Funding source recording failed:`, err),
  )

  awardDepositBonusForFunding({
    userId,
    depositAmountKobo: result.amountKobo,
    fundingReference: eventReference,
  }).catch((err) => console.error(`[${source}] Deposit bonus award failed:`, err))

  applyKorapayChargeForFunding({
    userId,
    depositAmountKobo: result.amountKobo,
    fundingReference: eventReference,
  }).catch((err) => console.error(`[${source}] Korapay charge deduction failed:`, err))

  return { status: "success", newBalanceKobo }
}
