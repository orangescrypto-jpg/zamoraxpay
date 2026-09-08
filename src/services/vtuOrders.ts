// src/services/vtuOrders.ts
// Service abstraction layer — VTU order records.
// Routes never write to vtu_orders directly; they go through here.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import type { VtuRouterAttemptLog } from "@/src/services/vtuRouter"

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
    attempts: VtuRouterAttemptLog[]
    failureReason?: string
  },
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE vtu_orders SET
      status = ?, provider_used = ?, provider_reference = ?, provider_attempts = ?,
      failure_reason = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      result.status,
      result.providerUsed,
      result.providerReference,
      JSON.stringify(result.attempts),
      result.failureReason ?? null,
      orderId,
    ],
    nativeDB,
  )
}

export async function markOrderRefunded(orderId: string, nativeDB?: any): Promise<void> {
  await d1Query("UPDATE vtu_orders SET status = 'refunded', updated_at = datetime('now') WHERE id = ?", [orderId], nativeDB)
}

export async function getOrderHistory(userId: string, limit = 50, nativeDB?: any) {
  const result = await d1Query(
    "SELECT * FROM vtu_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit],
    nativeDB,
  )
  return result.results ?? []
}
