// src/services/vtuOrders.ts
// Service abstraction layer — VTU order records.
// Routes never write to vtu_orders directly; they go through here.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import type { VtuRouterAttemptLog } from "@/src/services/vtuRouter"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

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
    status: "success" | "failed"
    providerUsed: string | null
    providerReference: string | null
    deliveredData?: VtuDeliveredData
    attempts: VtuRouterAttemptLog[]
    failureReason?: string
  },
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE vtu_orders SET
      status = ?, provider_used = ?, provider_reference = ?, provider_attempts = ?,
      delivered_data = ?, failure_reason = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      result.status,
      result.providerUsed,
      result.providerReference,
      JSON.stringify(result.attempts),
      result.deliveredData ? JSON.stringify(result.deliveredData) : null,
      result.failureReason ?? null,
      orderId,
    ],
    nativeDB,
  )
}

export async function markOrderRefunded(orderId: string, nativeDB?: any): Promise<void> {
  await d1Query("UPDATE vtu_orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?", [orderId], nativeDB)
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
