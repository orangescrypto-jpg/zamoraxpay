// src/services/purchaseFlow.ts
// One shared orchestration function for every VTU service route
// (airtime, data, cable, electricity, exam_pin, betting). Each route
// just validates its own input shape and calls this — so the
// debit → route → refund-on-failure → email logic lives in exactly
// one place instead of being copy-pasted six times.

import { randomUUID } from "crypto"
import { lookupPrice } from "@/src/services/pricing"
import { createPendingOrder, finalizeOrder } from "@/src/services/vtuOrders"
import { debitWallet, refundWallet } from "@/src/services/wallet"
import { executeVtuPurchase } from "@/src/services/vtuRouter"
import { verifyPin } from "@/src/services/pin"
import { d1Query } from "@/lib/d1"
import { sendPurchaseReceiptEmail } from "@/src/services/email"
import { isFeatureEnabled } from "@/src/services/config"
import { awardCashbackForOrder } from "@/src/services/cashback"
import { maybeAwardReferralBonus } from "@/src/services/referral"
import type { VtuServiceType } from "@/src/types"

export interface PurchaseFlowParams {
  userId: string
  serviceType: VtuServiceType
  networkOrBiller: string
  recipient: string
  planCode?: string | null
  requestedAmountKobo?: number // for flexible-amount services (airtime, electricity, betting)
  transactionPin: string
  isAutoReload?: boolean
  autoReloadRuleId?: string
}

export interface PurchaseFlowResult {
  success: boolean
  orderId?: string
  message: string
  chargedAmountKobo?: number
  newBalanceKobo?: number
  cashbackEarnedKobo?: number
}

export async function runPurchaseFlow(params: PurchaseFlowParams): Promise<PurchaseFlowResult> {
  // 1. Feature flag gate — admin can disable any service instantly.
  const flagKey = `service_${params.serviceType}`
  if (!(await isFeatureEnabled(flagKey))) {
    return { success: false, message: "This service is currently unavailable. Please try again later." }
  }

  // 2. Verify transaction PIN.
  const userResult = await d1Query("SELECT transaction_pin_hash, tier, email, full_name FROM users WHERE id = ?", [
    params.userId,
  ])
  const user = userResult.results?.[0]
  if (!user) return { success: false, message: "User not found" }
  if (!user.transaction_pin_hash) {
    return { success: false, message: "Please set a transaction PIN before making purchases" }
  }
  if (!verifyPin(params.transactionPin, user.transaction_pin_hash)) {
    return { success: false, message: "Incorrect transaction PIN" }
  }

  // 3. Resolve price (admin-configured, tier-aware).
  const pricing = await lookupPrice(
    params.serviceType,
    params.networkOrBiller,
    params.planCode ?? null,
    user.tier,
    params.requestedAmountKobo,
  )
  if (!pricing.found) {
    return { success: false, message: "No price configured for this selection. Please contact support." }
  }

  // 4. Create the pending order record.
  const orderId = await createPendingOrder({
    userId: params.userId,
    serviceType: params.serviceType,
    networkOrBiller: params.networkOrBiller,
    recipient: params.recipient,
    planCode: params.planCode ?? null,
    amountKobo: pricing.chargeAmountKobo,
    baseAmountKobo: pricing.baseAmountKobo,
    convenienceFeeKobo: pricing.convenienceFeeKobo,
    pricingTier: pricing.tierUsed,
    isAutoReload: params.isAutoReload,
    autoReloadRuleId: params.autoReloadRuleId,
  })

  // 5. Debit wallet BEFORE attempting fulfillment (never let a user's
  // balance and their order fulfillment race each other).
  const debitReference = `ZPORD-${orderId}`
  const debit = await debitWallet({
    userId: params.userId,
    amountKobo: pricing.chargeAmountKobo,
    type: "purchase",
    reference: debitReference,
    relatedOrderId: orderId,
  })

  if (!debit.success) {
    await finalizeOrder(orderId, {
      status: "failed",
      providerUsed: null,
      providerReference: null,
      attempts: [],
      failureReason: debit.message,
    })
    return { success: false, message: debit.message ?? "Insufficient wallet balance", orderId }
  }

  // 6. Run the VTU fallback router — sequential, priority-ordered.
  const routerResult = await executeVtuPurchase({
    serviceType: params.serviceType,
    networkOrBiller: params.networkOrBiller,
    recipient: params.recipient,
    planCode: params.planCode ?? undefined,
    amountKobo: pricing.baseAmountKobo,
    internalReference: debitReference,
  })

  await finalizeOrder(orderId, {
    status: routerResult.success ? "success" : "failed",
    providerUsed: routerResult.providerUsed,
    providerReference: routerResult.providerReference,
    attempts: routerResult.attempts,
    failureReason: routerResult.success ? undefined : routerResult.message,
  })

  // 7. If every provider failed, auto-refund the wallet — no manual
  // intervention needed. If the order succeeded, award cashback
  // instead (admin-controlled: min amount, percentage/flat, cap).
  let newBalanceKobo = debit.newBalanceKobo
  let cashbackEarnedKobo = 0
  if (!routerResult.success) {
    const refund = await refundWallet({
      userId: params.userId,
      amountKobo: pricing.chargeAmountKobo,
      reference: `ZPREF-${orderId}`,
      relatedOrderId: orderId,
    })
    newBalanceKobo = refund.newBalanceKobo
  } else {
    const cashback = await awardCashbackForOrder({
      userId: params.userId,
      orderId,
      purchaseAmountKobo: pricing.chargeAmountKobo,
    })
    if (cashback.eligible) {
      cashbackEarnedKobo = cashback.amountKobo
      newBalanceKobo = newBalanceKobo + cashback.amountKobo
    }

    // Fire-and-forget-safe (awaited, but errors here shouldn't fail the
    // purchase response) — checks if this was the referred user's
    // first successful order and pays the referrer if so.
    await maybeAwardReferralBonus(params.userId).catch((err) =>
      console.error("[purchaseFlow] Referral bonus award failed:", err),
    )
  }

  // 8. Fire-and-forget receipt email.
  if (user.email) {
    sendPurchaseReceiptEmail(user.email, {
      serviceType: params.serviceType,
      recipient: params.recipient,
      amountNaira: pricing.chargeAmountKobo / 100,
      status: routerResult.success ? "success" : "failed",
    }).catch((err) => console.error("[purchaseFlow] Receipt email failed:", err))
  }

  return {
    success: routerResult.success,
    orderId,
    message: routerResult.success
      ? cashbackEarnedKobo > 0
        ? `Purchase successful — you earned ₦${(cashbackEarnedKobo / 100).toLocaleString()} cashback`
        : "Purchase successful"
      : `Purchase failed — ${routerResult.message} Your wallet has been refunded.`,
    chargedAmountKobo: pricing.chargeAmountKobo,
    newBalanceKobo,
    cashbackEarnedKobo,
  }
}
