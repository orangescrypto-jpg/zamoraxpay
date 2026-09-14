// src/services/purchaseFlow.ts
// One shared orchestration function for every VTU service route
// (airtime, data, cable, electricity, exam_pin, epin, betting). Each
// route just validates its own input shape and calls this — so the
// debit → route → refund-on-failure → email logic lives in exactly
// one place instead of being copy-pasted seven times.

import { randomUUID } from "crypto"
import { lookupPrice, listPlanGroups } from "@/src/services/pricing"
import { createPendingOrder, finalizeOrder } from "@/src/services/vtuOrders"
import { debitWallet, refundWallet } from "@/src/services/wallet"
import { executeVtuPurchase } from "@/src/services/vtuRouter"
import { hasLiveRoute } from "@/src/services/providerPlanMappings"
import { verifyPin } from "@/src/services/pin"
import { d1Query } from "@/lib/d1"
import { sendPurchaseReceiptEmail } from "@/src/services/email"
import { isFeatureEnabled } from "@/src/services/config"
import { awardCashbackForOrder } from "@/src/services/cashback"
import { maybeAwardReferralBonus } from "@/src/services/referral"
import type { VtuServiceType } from "@/src/types"
import type { VtuDeliveredData } from "@/src/services/providers/vtu/types"

export interface PurchaseFlowParams {
  userId: string
  serviceType: VtuServiceType
  networkOrBiller: string
  recipient: string
  planCode?: string | null // exam_pin: pin type ("registration" | "result_checker") / epin: denomination ("100" | "200" | "500")
  quantity?: number // exam_pin and epin only — number of PINs to purchase
  requestedAmountKobo?: number // for flexible-amount services (airtime, electricity, betting)
  transactionPin: string
  isAutoReload?: boolean
  autoReloadRuleId?: string
  // Price the customer saw on the buy page for this exact planCode.
  // If the resolved price at purchase time doesn't match (plan was
  // repriced, or the row backing it changed between page-load and
  // submit), the purchase is NOT charged — it's reported back as
  // requiresPriceConfirmation so the frontend can show the new price
  // and let the customer explicitly confirm before anything is
  // charged. Optional so existing callers that don't send it keep
  // working exactly as before (no confirmation gate).
  expectedPriceKobo?: number
}

export interface PurchaseFlowResult {
  success: boolean
  orderId?: string
  message: string
  chargedAmountKobo?: number
  newBalanceKobo?: number
  cashbackEarnedKobo?: number
  deliveredData?: VtuDeliveredData
  // True when expectedPriceKobo was sent and didn't match the price
  // just resolved for this exact planCode — nothing was charged, no
  // order/pending record was created. actualPriceKobo is what it would
  // cost now; the caller should show that and let the customer
  // explicitly resubmit (with expectedPriceKobo = actualPriceKobo) to
  // proceed at the new price.
  requiresPriceConfirmation?: boolean
  actualPriceKobo?: number
  // True when the exact planCode the customer picked has NO live
  // provider right now (checked BEFORE debit — see hasLiveRoute).
  // suggestedPlanCode/suggestedPriceKobo, when present, is the next-
  // cheapest sibling variant (same size+validity+network, different
  // category) that IS currently live — the caller shows "Awoof
  // unavailable, Standard is ₦109 instead — continue?" and only
  // resubmits (with planCode = suggestedPlanCode and
  // expectedPriceKobo = suggestedPriceKobo) on explicit confirmation.
  // Nothing is charged and no order is created when this fires.
  planUnavailable?: boolean
  suggestedPlanCode?: string
  suggestedPriceKobo?: number
}

export async function runPurchaseFlow(params: PurchaseFlowParams): Promise<PurchaseFlowResult> {
  // 1. Feature flag gate — admin can disable any service instantly.
  const flagKey = `service_${params.serviceType}`
  if (!(await isFeatureEnabled(flagKey))) {
    return { success: false, message: "This service is currently unavailable. Please try again later." }
  }

  // 2. Verify transaction PIN.
  const userResult = await d1Query("SELECT transaction_pin_hash, tier, email, full_name, phone FROM users WHERE id = ?", [
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
  //
  // exam_pin and epin are both plan-coded like data/cable: plan_code
  // carries the pin type ("registration" | "result_checker") for
  // exam_pin, or the denomination ("100" | "200" | "500") for epin —
  // priced per-unit per network/exam-body + plan_code via pricing_rules.
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

  const isQuantityService = params.serviceType === "exam_pin" || params.serviceType === "epin"
  const quantity = isQuantityService ? Math.max(1, params.quantity ?? 1) : 1
  if (quantity > 1) {
    pricing.baseAmountKobo *= quantity
    pricing.chargeAmountKobo *= quantity
    pricing.convenienceFeeKobo *= quantity
  }

  // 3b. Price-confirmation gate. Only applies when the caller sent
  // expectedPriceKobo (i.e. the buy page knows the price it showed).
  // Checked BEFORE any order is created or wallet debited — a mismatch
  // here means the customer sees the new price and must resubmit to
  // actually pay it, never gets silently charged more than they agreed to.
  if (
    params.expectedPriceKobo !== undefined &&
    params.expectedPriceKobo !== pricing.chargeAmountKobo
  ) {
    return {
      success: false,
      message: "This plan's price has changed since you loaded the page. Please confirm the new price to continue.",
      requiresPriceConfirmation: true,
      actualPriceKobo: pricing.chargeAmountKobo,
    }
  }

  // 3c. Pre-debit liveness check — plan-coded services only, and only
  // when a planCode is actually present. Catches "the only provider
  // for this exact plan just went down" BEFORE any money moves, so a
  // sibling category can be offered instead of debit → router-fails →
  // refund, which would otherwise be the customer's only signal that
  // something else is available. Deliberately narrow: this suggests a
  // DIFFERENT plan_code (a different category, e.g. Awoof -> Standard)
  // for the customer to explicitly accept — it never silently
  // substitutes one itself, for the same activation-behavior reasons
  // categories are kept separate everywhere else in this codebase.
  if (
    params.planCode &&
    (params.serviceType === "data" || params.serviceType === "cable") &&
    !(await hasLiveRoute(params.serviceType, params.networkOrBiller, params.planCode))
  ) {
    const groups = await listPlanGroups(params.serviceType, params.networkOrBiller, user.tier)
    const group = groups.find((g) => g.variants.some((v) => v.planCode === params.planCode))
    const alternative = group?.variants.find((v) => v.planCode !== params.planCode)

    if (alternative) {
      return {
        success: false,
        message: `This plan is currently unavailable. ${alternative.category} is available at ₦${(alternative.priceKobo / 100).toLocaleString()} — confirm to continue with that instead.`,
        planUnavailable: true,
        suggestedPlanCode: alternative.planCode,
        suggestedPriceKobo: alternative.priceKobo,
      }
    }
    // No live sibling either — fall through to the normal flow, which
    // will debit, let the router fail as usual, and auto-refund. Not
    // returning early here on purpose: a stale/incomplete provider-
    // mapping read shouldn't block a purchase that might still
    // succeed — the router is the actual source of truth on attempt.
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
    quantity: isQuantityService ? quantity : undefined,
    amountKobo: pricing.baseAmountKobo,
    internalReference: debitReference,
    // Optional — only a couple of adapters (e.g. VTUGate electricity)
    // need an SMS-receipt phone number for non-airtime purchases.
    // Falls back to undefined if the account somehow has no phone on
    // file; adapters that don't need it simply ignore the field, and
    // the ones that do (VTUGate) fall back to a placeholder themselves
    // rather than failing the purchase over a missing contact number.
    contactPhone: user.phone ?? undefined,
  })

  await finalizeOrder(orderId, {
    status: routerResult.success ? "success" : "failed",
    providerUsed: routerResult.providerUsed,
    providerReference: routerResult.providerReference,
    deliveredData: routerResult.deliveredData,
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
      : `${routerResult.message} Your wallet has been refunded.`,
    chargedAmountKobo: pricing.chargeAmountKobo,
    newBalanceKobo,
    cashbackEarnedKobo,
    deliveredData: routerResult.success ? routerResult.deliveredData : undefined,
  }
}
