// src/services/paymentWebhook.ts
// Shared processing for payment-provider webhooks (Korapay + Paystack).
//
// WHY THIS EXISTS
// The old handlers did:   1. INSERT event into payment_webhook_events
//                         2. creditWallet(...)
// If step 2 threw (D1 timeout, network blip), the event row was already
// written. The provider then retried the webhook, the handler saw the
// row, answered "Already processed", and the customer — who had really
// paid — was never credited. There was no way to recover except a
// manual admin adjustment.
//
// THE FIX
// Money safety no longer depends on the event log at all. creditWallet
// is idempotent on its own UNIQUE(reference) constraint (see wallet.ts),
// so re-running a credit for an already-credited payment is a harmless
// no-op. That lets us treat payment_webhook_events as an AUDIT RECORD,
// not a gate:
//
//   1. Verify signature (done by the route, before calling this).
//   2. Credit the wallet. Idempotent — safe to run any number of times.
//   3. Run the side effects (deposit bonus, provider charge, funding
//      source, email). Each is idempotent via its own derived reference.
//   4. ONLY THEN record the event as processed.
//
// If step 2 or 3 throws, we return HTTP 500 and DO NOT record the event,
// so the provider's retry re-runs everything and the customer gets paid.
// If step 4 fails, the money is already correct; we log it and still
// return 200 (a retry would just no-op through the idempotent credit).

import { d1Query } from "@/lib/d1"
import { creditWallet } from "@/src/services/wallet"
import { sendWalletFundedEmail } from "@/src/services/email"
import { recordFundingSource } from "@/src/services/fundingSource"
import type { FundingSourceDetails } from "@/src/services/fundingSource"
import { awardDepositBonusForFunding } from "@/src/services/depositBonus"
import { applyKorapayChargeForFunding } from "@/src/services/korapayCharge"

export type PaymentProviderKey = "korapay" | "paystack"

export interface FundingWebhookInput {
  provider: PaymentProviderKey
  /** The provider's event/transaction id — also the idempotency key. */
  eventId: string
  eventType: string
  rawBody: string
  userId: string
  amountKobo: number
  fundingSource: FundingSourceDetails | null
}

export interface FundingWebhookResult {
  credited: boolean
  newBalanceKobo: number
}

/**
 * Credits a verified funding event and runs its side effects. THROWS on
 * any failure that should make the provider retry. Never call this for
 * events belonging to another site or for non-success events.
 */
export async function processFundingWebhook(input: FundingWebhookInput): Promise<FundingWebhookResult> {
  const tag = input.provider.toUpperCase()
  const fundingReference = `ZPWF-${tag}-${input.eventId}`

  // Idempotent: a retry for an already-credited payment returns the
  // current balance without crediting again.
  const { newBalanceKobo } = await creditWallet({
    userId: input.userId,
    amountKobo: input.amountKobo,
    type: "funding",
    reference: fundingReference,
    providerReference: input.eventId,
    metadata: { provider: input.provider },
  })

  // Each of these is idempotent on a reference derived from
  // fundingReference, so re-running them on a retry can never
  // double-award a bonus or double-charge a fee.
  //
  // They are awaited (previously fire-and-forget) so that a failure here
  // fails the request and triggers a provider retry, instead of being
  // silently lost. A bonus or charge that never applied is a real
  // discrepancy, not something to swallow.
  await awardDepositBonusForFunding({
    userId: input.userId,
    depositAmountKobo: input.amountKobo,
    fundingReference,
  })

  await applyKorapayChargeForFunding({
    userId: input.userId,
    depositAmountKobo: input.amountKobo,
    fundingReference,
  })

  // These two are genuinely best-effort: neither moves money, and
  // failing a webhook (and re-running a credit) over a missed email or a
  // funding-source row would be worse than skipping them.
  await recordFundingSource(input.userId, input.provider, input.fundingSource).catch((err) =>
    console.error(`[${input.provider} webhook] Funding source recording failed:`, err),
  )

  const userResult = await d1Query("SELECT email FROM users WHERE id = ?", [input.userId]).catch(() => null)
  const email = userResult?.results?.[0]?.email
  if (email) {
    sendWalletFundedEmail(email, input.amountKobo / 100, newBalanceKobo / 100).catch((err) =>
      console.error(`[${input.provider} webhook] Email failed:`, err),
    )
  }

  // Money is correct and all side effects have applied. Record the
  // event LAST, so it can only ever mean "fully processed".
  await recordWebhookEvent(input.provider, input.eventId, input.eventType, input.rawBody)

  return { credited: true, newBalanceKobo }
}

/**
 * Records an event as processed. INSERT OR IGNORE: if a concurrent
 * delivery of the same event got here first, that is fine — the row
 * exists and that is all we wanted.
 *
 * Never throws: by the time this runs, the money is already correct.
 * A failure here only means a future retry re-runs idempotent steps.
 */
export async function recordWebhookEvent(
  provider: PaymentProviderKey,
  eventId: string,
  eventType: string,
  rawBody: string,
): Promise<void> {
  try {
    await d1Query(
      "INSERT OR IGNORE INTO payment_webhook_events (id, provider, event_type, payload) VALUES (?, ?, ?, ?)",
      [eventId, provider, eventType, rawBody],
    )
  } catch (err) {
    console.error(`[${provider} webhook] Failed to record processed event ${eventId} (money already correct):`, err)
  }
}

/** True if this event id has already been fully processed. */
export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const existing = await d1Query("SELECT id FROM payment_webhook_events WHERE id = ?", [eventId])
  return (existing.results?.length ?? 0) > 0
}
