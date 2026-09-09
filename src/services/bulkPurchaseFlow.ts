// src/services/bulkPurchaseFlow.ts
// Orchestrates a bulk airtime/data purchase across every number in a
// saved contact batch. Reuses runPurchaseFlow (the same debit →
// route → refund-on-failure logic every other service uses) once per
// number, in sequence — never in parallel.
//
// Sequential, not Promise.all, is deliberate: wallet.ts's debit/credit
// functions do a read-then-write on balance_kobo with no row locking
// (see wallet.ts's docstring — that's fine for a single in-flight
// request, but firing 100 debits concurrently against the same wallet
// would race). Awaiting each purchase in turn keeps every debit
// strictly serialized against the same wallet, at the cost of a bulk
// run taking roughly (per-purchase latency × count) instead of being
// parallelized. For 100 numbers at ~1-2s each this is well under a
// minute — acceptable for what's a background-feeling bulk action.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"
import { verifyPin } from "@/src/services/pin"
import { detectNetwork, type NetworkName } from "@/lib/networkDetect"
import { getContactBatch } from "@/src/services/contactBatches"

export interface BulkPurchaseItemResult {
  phone: string
  detectedNetwork: NetworkName | null
  success: boolean
  message: string
  chargedKobo?: number
  orderId?: string
}

export interface BulkPurchaseResult {
  success: boolean // true if at least the batch was processed (individual items may still fail)
  message?: string // set only for whole-run failures (bad PIN, batch not found, etc) that stop before processing
  runId?: string
  successCount: number
  failureCount: number
  totalChargedKobo: number
  items: BulkPurchaseItemResult[]
}

export interface BulkAirtimeParams {
  userId: string
  batchId: string
  serviceType: "airtime"
  amountKobo: number // same top-up amount sent to every number
  transactionPin: string
}

export interface BulkDataParams {
  userId: string
  batchId: string
  serviceType: "data"
  network: NetworkName // data plans/pricing are per-network (see pricing.ts — plan_code is scoped to one network_or_biller), so unlike airtime, bulk data can't auto-detect per number: one plan is bought for the whole group, on this one network
  planCode: string
  transactionPin: string
}

export type BulkPurchaseParams = BulkAirtimeParams | BulkDataParams

export async function runBulkPurchase(params: BulkPurchaseParams): Promise<BulkPurchaseResult> {
  // 1. Verify PIN once upfront — fails fast instead of discovering a
  // wrong PIN only after already iterating every number (each
  // individual runPurchaseFlow call re-verifies too, since it doesn't
  // know it's being called from a bulk context; this is just an
  // early exit so a mistyped PIN doesn't cost a scrypt hash per
  // number for nothing).
  const userResult = await d1Query("SELECT transaction_pin_hash FROM users WHERE id = ?", [params.userId])
  const pinHash = userResult.results?.[0]?.transaction_pin_hash as string | undefined
  if (!pinHash) {
    return { success: false, message: "Please set a transaction PIN before making purchases", successCount: 0, failureCount: 0, totalChargedKobo: 0, items: [] }
  }
  if (!verifyPin(params.transactionPin, pinHash)) {
    return { success: false, message: "Incorrect transaction PIN", successCount: 0, failureCount: 0, totalChargedKobo: 0, items: [] }
  }

  // 2. Load the batch (ownership-checked inside getContactBatch).
  const batch = await getContactBatch(params.userId, params.batchId)
  if (!batch) {
    return { success: false, message: "Group not found", successCount: 0, failureCount: 0, totalChargedKobo: 0, items: [] }
  }
  if (batch.numbers.length === 0) {
    return { success: false, message: "This group has no numbers in it", successCount: 0, failureCount: 0, totalChargedKobo: 0, items: [] }
  }

  // 3. Create the parent run record up front, so it's visible in
  // history even if the process is interrupted partway (e.g. a
  // platform timeout on a very large batch).
  const runId = randomUUID()
  await d1Query(
    `INSERT INTO bulk_purchase_runs
      (id, user_id, batch_id, batch_name_snapshot, service_type, network_or_biller, plan_code, amount_kobo, total_numbers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      params.userId,
      batch.id,
      batch.name,
      params.serviceType,
      params.serviceType === "data" ? params.network : null,
      params.serviceType === "data" ? params.planCode : null,
      params.serviceType === "airtime" ? params.amountKobo : null,
      batch.numbers.length,
    ],
  )

  const items: BulkPurchaseItemResult[] = []
  let successCount = 0
  let totalChargedKobo = 0

  // 4. Sequential loop — see file docstring for why not parallel.
  for (const { phone } of batch.numbers) {
    const detectedNetwork = detectNetwork(phone)

    if (params.serviceType === "data") {
      // Plans/pricing are scoped to one network (see BulkDataParams
      // docstring), so a number whose detected network doesn't match
      // the chosen network would either fail at the provider or,
      // worse, silently get charged the wrong network's price if the
      // provider is lenient about it. Skip rather than guess.
      if (detectedNetwork && detectedNetwork !== params.network) {
        const item: BulkPurchaseItemResult = {
          phone,
          detectedNetwork,
          success: false,
          message: `Detected as ${detectedNetwork}, not ${params.network} — skipped to avoid buying the wrong network's plan`,
        }
        items.push(item)
        await recordItem(runId, item)
        continue
      }
      // Undetectable prefix (rare — see networkDetect.ts's prefix
      // list) is let through rather than blocked, same tolerance the
      // single-purchase data page already applies via
      // matchesSelectedNetwork — it could be a ported number.
    }

    const result = await runPurchaseFlow(
      params.serviceType === "airtime"
        ? {
            userId: params.userId,
            serviceType: "airtime",
            networkOrBiller: detectedNetwork ?? "MTN", // airtime purchase still needs a provider_id; fall back to MTN's routing only if truly undetectable (rare — see detectNetwork's prefix list)
            recipient: phone,
            requestedAmountKobo: params.amountKobo,
            transactionPin: params.transactionPin,
          }
        : {
            userId: params.userId,
            serviceType: "data",
            networkOrBiller: params.network,
            recipient: phone,
            planCode: params.planCode,
            transactionPin: params.transactionPin,
          },
    )

    const item: BulkPurchaseItemResult = {
      phone,
      detectedNetwork,
      success: result.success,
      message: result.message,
      chargedKobo: result.chargedAmountKobo,
      orderId: result.orderId,
    }
    items.push(item)
    await recordItem(runId, item)

    if (result.success) {
      successCount++
      totalChargedKobo += result.chargedAmountKobo ?? 0
    }
  }

  const failureCount = items.length - successCount
  const status = failureCount === 0 ? "completed" : "completed_with_errors"

  await d1Query(
    `UPDATE bulk_purchase_runs
     SET success_count = ?, failure_count = ?, total_charged_kobo = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [successCount, failureCount, totalChargedKobo, status, runId],
  )

  return {
    success: true,
    runId,
    successCount,
    failureCount,
    totalChargedKobo,
    items,
  }
}

async function recordItem(runId: string, item: BulkPurchaseItemResult): Promise<void> {
  await d1Query(
    `INSERT INTO bulk_purchase_items
      (id, run_id, phone, detected_network, order_id, status, failure_reason, charged_kobo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      runId,
      item.phone,
      item.detectedNetwork,
      item.orderId ?? null,
      item.success ? "success" : "failed",
      item.success ? null : item.message,
      item.chargedKobo ?? null,
    ],
  )
}
