// src/services/orphanedOrders.ts
// Recovery for VTU orders the normal reconcile cron can never see.
//
// THE GAP
// purchaseFlow.ts runs:  createPendingOrder -> debitWallet -> provider
// call -> finalizeOrder. If the process dies anywhere between the debit
// and finalizeOrder (serverless timeout, crash, mid-request deploy, or
// the provider call itself timing out), the order row stays
// status='pending' with provider_reference = NULL while the customer's
// wallet has ALREADY been debited.
//
// getPendingOrders() (used by /api/cron/reconcile-pending-orders)
// requires `provider_reference IS NOT NULL`, so these rows are
// invisible to it — the customer is out the money with nothing pending
// anywhere that would ever resolve it.
//
// WHY THIS DOES NOT SIMPLY REFUND
// We cannot tell from the row alone whether the provider delivered. If
// the process died AFTER the provider accepted the order, a blind refund
// hands the customer free airtime/data. So for each orphan we:
//
//   1. Ask the provider, using our own internalReference (ZPORD-<id>),
//      which every adapter already sends with the purchase. Only
//      providers we can identify are asked: the ones recorded in
//      provider_attempts, most recent first.
//   2. Definite "success"  -> mark success, no refund, award rewards.
//   3. Definite "failed"   -> mark failed, refund the wallet.
//   4. Anything else (pending, error, no provider knows the order)
//      -> leave it alone until it is old enough, then FLAG for admin.
//
// We never auto-refund on silence or uncertainty.
//
// IMPORTANT — an empty provider_attempts does NOT mean "no provider was
// called". provider_attempts is written only by finalizeOrder, AFTER the
// router returns. An order whose process died DURING the provider call
// therefore also has an empty log, yet the provider may well have
// delivered. (An earlier draft of this file treated "no attempts logged"
// as safe-to-refund; that would have refunded customers who received
// their airtime — free airtime, paid for by you.) With no log, we ask
// every currently-enabled provider and require a positive "failed" from
// ALL of them, and even then we route through an admin (see below)
// rather than refund, because a provider that has since been disabled
// cannot be asked and might be the one that delivered.

import { d1Query } from "@/lib/d1"
import { getVtuAdapter } from "@/src/services/providers/vtu/registry"
import { getVtuProviderCredentials, getActiveVtuProviders } from "@/src/services/config"
import { resolvePendingOrder } from "@/src/services/vtuOrders"
import { refundWallet } from "@/src/services/wallet"
import { awardCashbackForOrder } from "@/src/services/cashback"
import { maybeAwardReferralBonus } from "@/src/services/referral"

// An order younger than this may simply still be mid-flight in a live
// request. Never touch it — that would race the purchase that owns it.
const MIN_AGE_MINUTES = 10

// After this long with no definite answer, stop asking and surface it to
// an admin instead of retrying forever.
const ESCALATE_AFTER_MINUTES = 60

export type OrphanOutcome =
  | "resolved_success"
  | "resolved_failed_refunded"
  | "still_unknown"
  | "flagged_for_admin"
  | "skipped_already_handled"
  | "error"

export interface OrphanResult {
  orderId: string
  outcome: OrphanOutcome
  detail: string
}

/**
 * Orders stuck in 'pending' with NO provider_reference, old enough that
 * a live request can no longer own them. Excludes orders already
 * flagged for admin review.
 */
export async function getOrphanedOrders(limit = 50, nativeDB?: any) {
  const result = await d1Query(
    `SELECT * FROM vtu_orders
      WHERE status = 'pending'
        AND provider_reference IS NULL
        AND datetime(created_at) <= datetime('now', ?)
        AND (failure_reason IS NULL OR failure_reason NOT LIKE 'NEEDS_REVIEW:%')
      ORDER BY created_at ASC
      LIMIT ?`,
    [`-${MIN_AGE_MINUTES} minutes`, limit],
    nativeDB,
  )
  return result.results ?? []
}

/** Providers actually attempted for this order, most recent first. */
function attemptedProviders(order: any): string[] {
  if (!order.provider_attempts) return []
  try {
    const attempts = JSON.parse(order.provider_attempts)
    if (!Array.isArray(attempts)) return []
    return attempts
      .map((a: any) => a?.providerKey)
      .filter((k: unknown): k is string => typeof k === "string")
      .reverse()
  } catch {
    return []
  }
}

function ageMinutes(order: any): number {
  // D1 datetime('now') is UTC "YYYY-MM-DD HH:MM:SS" with no zone marker.
  const created = Date.parse(String(order.created_at).replace(" ", "T") + "Z")
  return Number.isNaN(created) ? 0 : (Date.now() - created) / 60_000
}

async function flagForAdmin(order: any, reason: string, nativeDB?: any): Promise<void> {
  await d1Query(
    `UPDATE vtu_orders
        SET failure_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'`,
    [`NEEDS_REVIEW: ${reason}`, order.id],
    nativeDB,
  )
}

async function refundOrphan(order: any, nativeDB?: any): Promise<void> {
  // Same reference format purchaseFlow.ts and the main reconcile cron
  // use (ZPREF-<orderId>), so if any of them also tries to refund this
  // order, creditWallet's unique-reference guard makes the second one a
  // no-op. Refunding is therefore safe against a double-refund race.
  await refundWallet(
    {
      userId: order.user_id,
      amountKobo: order.amount_kobo,
      reference: `ZPREF-${order.id}`,
      relatedOrderId: order.id,
    },
    nativeDB,
  )
}

/** Recovers a single orphaned order. Never throws. */
export async function recoverOrphanedOrder(order: any, nativeDB?: any): Promise<OrphanResult> {
  try {
    const providers = attemptedProviders(order)
    const internalReference = `ZPORD-${order.id}`

    // No attempt log. This does NOT prove no provider was called (see the
    // header): the log is only written after the router returns, so a
    // process that died mid-call leaves it empty even if a provider
    // delivered. So we ask every enabled provider for this service.
    let candidates = providers
    let logWasEmpty = false
    if (candidates.length === 0) {
      logWasEmpty = true
      const active = await getActiveVtuProviders(order.service_type, nativeDB)
      candidates = active.map((p) => p.providerKey)
    }

    // Ask each candidate provider about our reference (ZPORD-<id>).
    let sawDefiniteFailureFromEvery = true
    let anyAnswered = false

    for (const providerKey of candidates) {
      const adapter = getVtuAdapter(providerKey)
      if (!adapter) {
        sawDefiniteFailureFromEvery = false
        continue
      }

      let status
      try {
        const credentials = await getVtuProviderCredentials(providerKey, nativeDB)
        status = await adapter.checkStatus(internalReference, credentials)
      } catch {
        // Could not reach / understand this provider. That is NOT
        // evidence the order failed.
        sawDefiniteFailureFromEvery = false
        continue
      }

      anyAnswered = true

      if (status.status === "success") {
        await d1Query(
          `UPDATE vtu_orders
              SET provider_used = ?, provider_reference = ?, updated_at = datetime('now')
            WHERE id = ? AND status = 'pending' AND provider_reference IS NULL`,
          [providerKey, internalReference, order.id],
          nativeDB,
        )
        await resolvePendingOrder(order.id, { status: "success", deliveredData: status.deliveredData }, nativeDB)
        await awardCashbackForOrder({
          userId: order.user_id,
          orderId: order.id,
          purchaseAmountKobo: order.amount_kobo,
        }).catch((err) => console.error("[orphanedOrders] cashback failed:", order.id, err))
        await maybeAwardReferralBonus(order.user_id).catch((err) =>
          console.error("[orphanedOrders] referral failed:", order.id, err),
        )
        return {
          orderId: order.id,
          outcome: "resolved_success",
          detail: `${providerKey} confirmed delivery; no refund.`,
        }
      }

      if (status.status !== "failed") {
        // "pending" — the provider knows the order and is still working
        // on it. Definitely do not refund.
        sawDefiniteFailureFromEvery = false
      }
    }

    // Refund ONLY if every attempted provider positively said "failed".
    // One shrug from any provider (error, unknown, pending) blocks it.
    // With an empty attempt log we cannot know every provider that might
    // have been called (one could have been disabled since). So even a
    // unanimous "failed" from the ones we could ask is not proof — those
    // orders always go to an admin instead of being auto-refunded.
    if (anyAnswered && sawDefiniteFailureFromEvery && !logWasEmpty) {
      // Refund first, then flip status (see the note above).
      await refundOrphan(order, nativeDB)
      await resolvePendingOrder(
        order.id,
        { status: "failed", failureReason: "Provider confirmed this order was not delivered. Wallet refunded." },
        nativeDB,
      )
      return {
        orderId: order.id,
        outcome: "resolved_failed_refunded",
        detail: "Every attempted provider confirmed failure; refunded.",
      }
    }

    // Uncertain. Keep waiting, then escalate to a human.
    if (ageMinutes(order) >= ESCALATE_AFTER_MINUTES) {
      await flagForAdmin(
        order,
        `No definite provider answer after ${ESCALATE_AFTER_MINUTES}+ min (asked: ${candidates.join(", ") || "none enabled"}${logWasEmpty ? "; no attempt log was recorded" : ""}). ` +
          `Customer wallet is debited. Check the provider dashboard for ref ${internalReference}, then resolve manually.`,
        nativeDB,
      )
      return {
        orderId: order.id,
        outcome: "flagged_for_admin",
        detail: "No definite answer; flagged for manual review.",
      }
    }

    return {
      orderId: order.id,
      outcome: "still_unknown",
      detail: "No definite provider answer yet; will retry.",
    }
  } catch (err) {
    return {
      orderId: order.id,
      outcome: "error",
      detail: err instanceof Error ? err.message : "Unexpected error",
    }
  }
}

/** Orders flagged for an admin, oldest first — for an admin list/alert. */
export async function getOrdersNeedingReview(limit = 100, nativeDB?: any) {
  const result = await d1Query(
    `SELECT id, user_id, service_type, network_or_biller, recipient, amount_kobo,
            provider_attempts, failure_reason, created_at
       FROM vtu_orders
      WHERE status = 'pending' AND failure_reason LIKE 'NEEDS_REVIEW:%'
      ORDER BY created_at ASC
      LIMIT ?`,
    [limit],
    nativeDB,
  )
  return result.results ?? []
}
