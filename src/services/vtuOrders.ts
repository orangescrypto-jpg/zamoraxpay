// src/services/vtuOrders.ts
// Service abstraction layer — VTU order records.
// Routes never write to vtu_orders directly; they go through here.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import type { VtuRouterAttemptLog } from "@/src/services/vtuRouter"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

// Spin & Win: a voucher or discount coupon that was attached to an order is put
// back to 'active' when that order FAILS or is REFUNDED, so a prize is never lost
// to a failed delivery. Best-effort and silent: the order status change must
// never depend on it (and it is a harmless no-op if the spin tables don't exist
// yet or the order had no voucher).
async function restoreVoucherForOrder(orderId: string, nativeDB?: any): Promise<void> {
  try {
    await d1Query(
      `UPDATE spin_vouchers
          SET status = 'active', used_at = NULL, used_order_id = NULL, recipient = NULL
        WHERE used_order_id = ? AND status = 'used'`,
      [orderId],
      nativeDB,
    )
  } catch {
    // ignore — see above
  }
}

export async function createPendingOrder(
  params: {
    userId: string
    serviceType: VtuServiceType
    networkOrBiller: string
    recipient: string
    planCode: string | null
    amountKobo: number
    baseAmountKobo: number
    convenienceFeeKobo: number
    pricingTier: "retail" | "wholesale"
    isAutoReload?: boolean
    autoReloadRuleId?: string
  },
  nativeDB?: any,
): Promise<string> {
  const id = randomUUID()
  await d1Query(
    `INSERT INTO vtu_orders
      (id, user_id, service_type, network_or_biller, recipient, plan_code, amount_kobo, base_amount_kobo,
       convenience_fee_kobo, pricing_tier, status, is_auto_reload, auto_reload_rule_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id,
      params.userId,
      params.serviceType,
      params.networkOrBiller,
      params.recipient,
      params.planCode,
      params.amountKobo,
      params.baseAmountKobo,
      params.convenienceFeeKobo,
      params.pricingTier,
      params.isAutoReload ? 1 : 0,
      params.autoReloadRuleId ?? null,
    ],
    nativeDB,
  )
  return id
}

export async function finalizeOrder(
  orderId: string,
  result: {
    // "pending": the provider accepted the order but hasn't confirmed
    // actual delivery yet (see VtuPurchaseResult.isPending) — the
    // debit is final and stays, but cashback/referral are held and
    // the order sits here until the reconciliation cron (see
    // reconcileOrderStatus below) resolves it to "success" or "failed".
    status: "success" | "failed" | "pending"
    providerUsed: string | null
    providerReference: string | null
    deliveredData?: VtuDeliveredData
    attempts: VtuRouterAttemptLog[]
    failureReason?: string
    // What providerUsed actually cost us for THIS specific order (its
    // provider_plan_mappings.provider_cost_kobo at purchase time) —
    // independent of what pricing_rules charged the customer. Lets
    // the admin margin view show real per-order profit/loss instead
    // of only the plan-level pricing-basis estimate. Null when the
    // order failed entirely (no provider fulfilled it) or the
    // fulfilling provider had no cost mapping to look up (unmapped
    // fallback route).
    actualProviderCostKobo?: number | null
  },
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE vtu_orders SET
      status = ?, provider_used = ?, provider_reference = ?, provider_attempts = ?,
      delivered_data = ?, failure_reason = ?, actual_provider_cost_kobo = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      result.status,
      result.providerUsed,
      result.providerReference,
      JSON.stringify(result.attempts),
      result.deliveredData ? JSON.stringify(result.deliveredData) : null,
      result.failureReason ?? null,
      result.actualProviderCostKobo ?? null,
      orderId,
    ],
    nativeDB,
  )
  if (result.status === "failed") await restoreVoucherForOrder(orderId, nativeDB)
}

export async function markOrderRefunded(orderId: string, nativeDB?: any): Promise<void> {
  await d1Query("UPDATE vtu_orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?", [orderId], nativeDB)
  await restoreVoucherForOrder(orderId, nativeDB)
}

// Every order left in "pending" status — any provider, any service
// type. Provider-neutral by construction: this just reads whatever
// finalizeOrder wrote, it doesn't know or care which adapter produced
// it. Used by the reconciliation cron. olderThanMinutes skips
// brand-new pending orders that genuinely haven't had time to resolve
// yet, so the cron doesn't hammer a provider's status endpoint on an
// order that was created 10 seconds ago.
export async function getPendingOrders(olderThanMinutes = 2, limit = 100, nativeDB?: any) {
  const result = await d1Query(
    `SELECT * FROM vtu_orders
     WHERE status = 'pending'
       AND provider_reference IS NOT NULL
       AND datetime(created_at) <= datetime('now', ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [`-${olderThanMinutes} minutes`, limit],
    nativeDB,
  )
  return result.results ?? []
}

// Applies a reconciliation outcome (from checkStatus) to a pending
// order. Same status column every finalizeOrder write already uses —
// provider-neutral, driven entirely by the VtuStatusResult shape every
// adapter returns.
export async function resolvePendingOrder(
  orderId: string,
  result: { status: "success" | "failed"; deliveredData?: VtuDeliveredData; failureReason?: string },
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE vtu_orders SET
      status = ?, delivered_data = COALESCE(?, delivered_data), failure_reason = ?, updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    [
      result.status,
      result.deliveredData ? JSON.stringify(result.deliveredData) : null,
      result.failureReason ?? null,
      orderId,
    ],
    nativeDB,
  )
  if (result.status === "failed") await restoreVoucherForOrder(orderId, nativeDB)
}

// Used by the Pairgate webhook to resolve which order a callback
// belongs to. Pairgate echoes back whatever `reference` we sent on the
// original purchase call, which is our own `ZPORD-{orderId}` internal
// reference (see purchaseFlow.ts's debitReference) — so this just
// strips the prefix rather than needing a separate provider_reference
// lookup (provider_reference is Pairgate's OWN reference_code, which
// is different and not guaranteed to be present yet at purchase time
// for an async delivery).
export async function getOrderById(orderId: string, nativeDB?: any) {
  const result = await d1Query("SELECT * FROM vtu_orders WHERE id = ?", [orderId], nativeDB)
  return result.results?.[0] ?? null
}

// Merges newly-arrived delivered data into an order that's already
// marked 'success' from the original purchase call — this is what the
// Pairgate webhook calls once async delivery completes, as opposed to
// finalizeOrder (which sets the initial status/attempts at purchase
// time). Does not touch status: an order that already succeeded stays
// succeeded; this only fills in the PIN/token that arrived late.
export async function attachDeliveredData(
  orderId: string,
  deliveredData: VtuDeliveredData,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    "UPDATE vtu_orders SET delivered_data = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(deliveredData), orderId],
    nativeDB,
  )
}

export async function getOrderHistory(userId: string, limit = 50, nativeDB?: any) {
  const result = await d1Query(
    "SELECT * FROM vtu_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit],
    nativeDB,
  )
  return result.results ?? []
}

// Wallet-level transactions: funding, withdrawals, cashback, referral
// bonuses, reseller upgrades, refunds, admin adjustments. This is
// separate from vtu_orders (the purchase itself) — a single purchase
// creates both a vtu_orders row and a 'purchase' wallet_transactions
// row, linked via related_order_id.
export async function getWalletTransactionHistory(userId: string, limit = 50, nativeDB?: any) {
  const result = await d1Query(
    "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit],
    nativeDB,
  )
  return result.results ?? []
}
