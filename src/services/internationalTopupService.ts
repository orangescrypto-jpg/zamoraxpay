// src/services/internationalTopupService.ts
// Service abstraction layer — international airtime/data top-up.
//
// Deliberately NOT routed through vtuRouter.ts / runPurchaseFlow.ts:
// those assume the vtu_orders shape (networkOrBiller + recipient +
// planCode, priced via pricing_rules) and a single-call purchase. This
// service is its own vertical slice with its own table
// (international_topup_orders) because the shape genuinely doesn't
// fit — country/operator/FX-preview instead of network/plan-code — and
// the flow is a sequence (detect operator -> preview FX -> buy), not a
// single fallback-and-retry call.
//
// Provider-neutral despite only one adapter existing today: which
// provider handles a purchase is resolved via getActiveVtuProviders()
// filtered to "international_topup" — the exact same admin-controlled
// priority mechanism every other VTU service uses (see config.ts). Add
// a second adapter later (registry.ts) and seed its
// vtu_provider_configs row with "international_topup" in
// supports_services; nothing here changes.
//
// Pricing: this product is wholesale on the provider's side already
// (their own fee is baked into the NGN quote Preview FX Rate/Buy
// return, with commission always 0) — pricing_rules' network/biller/
// plan_code shape has no equivalent for "country + operator + live FX
// rate", so instead of forcing it into that table we apply a single
// admin-configured markup percentage (site_settings:
// international_topup_markup_pct) on top of the provider's NGN quote.
// The user is ALWAYS charged the provider's live re-quote at buy time
// plus this markup — never a cached preview amount, since FX rates move.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { isFeatureEnabled, getActiveVtuProviders, getVtuProviderCredentials } from "@/src/services/config"
import { getSettingNumber } from "@/src/services/siteSettings"
import { getInternationalTopupAdapter } from "@/src/services/providers/international/registry"
import { verifyPin } from "@/src/services/pin"
import { debitWallet, refundWallet } from "@/src/services/wallet"
import type { IntlCountry, IntlOperator } from "@/src/services/providers/international/types"

async function resolveProvider(nativeDB?: any) {
  // Same lookup every other VTU service uses — an admin-enabled
  // provider whose supports_services includes this service type,
  // ordered by priority (lowest first). Only vtugate is seeded today;
  // this is what makes adding a second provider later a config change,
  // not a code change.
  const active = await getActiveVtuProviders("international_topup", nativeDB)
  for (const providerConfig of active) {
    const adapter = getInternationalTopupAdapter(providerConfig.providerKey)
    if (adapter) return { adapter, providerKey: providerConfig.providerKey }
  }
  return null
}

function applyMarkup(providerChargeKobo: number, markupPct: number): number {
  return Math.round(providerChargeKobo * (1 + markupPct / 100))
}

export async function listCountries(nativeDB?: any): Promise<IntlCountry[]> {
  const resolved = await resolveProvider(nativeDB)
  if (!resolved) throw new Error("International top-up is not available right now")
  const credentials = await getVtuProviderCredentials(resolved.providerKey, nativeDB)
  return resolved.adapter.fetchCountries(credentials)
}

export async function listOperators(
  countryCode: string,
  type: "data" | undefined,
  nativeDB?: any,
): Promise<IntlOperator[]> {
  const resolved = await resolveProvider(nativeDB)
  if (!resolved) throw new Error("International top-up is not available right now")
  const credentials = await getVtuProviderCredentials(resolved.providerKey, nativeDB)
  return resolved.adapter.fetchOperators(countryCode, type, credentials)
}

export async function detectOperator(
  phoneNumber: string,
  countryCode: string,
  nativeDB?: any,
): Promise<IntlOperator | null> {
  const resolved = await resolveProvider(nativeDB)
  if (!resolved) throw new Error("International top-up is not available right now")
  const credentials = await getVtuProviderCredentials(resolved.providerKey, nativeDB)
  return resolved.adapter.detectOperator(phoneNumber, countryCode, credentials)
}

export interface FxPreviewResult {
  operatorId: number
  operatorName: string
  amount: number
  currencyCode: string
  markupPct: number
  chargedToUserKobo: number // provider quote + markup — informational only; buy() re-quotes at purchase time
}

export async function previewFx(operatorId: number, amount: number, nativeDB?: any): Promise<FxPreviewResult> {
  const resolved = await resolveProvider(nativeDB)
  if (!resolved) throw new Error("International top-up is not available right now")
  const credentials = await getVtuProviderCredentials(resolved.providerKey, nativeDB)
  const preview = await resolved.adapter.previewFxRate(operatorId, amount, credentials)
  const markupPct = await getSettingNumber("international_topup_markup_pct", 5, nativeDB)
  return {
    operatorId: preview.operatorId,
    operatorName: preview.operatorName,
    amount: preview.amount,
    currencyCode: preview.currencyCode,
    markupPct,
    chargedToUserKobo: applyMarkup(preview.chargedToUserKobo, markupPct),
  }
}

export interface PurchaseParams {
  userId: string
  operatorId?: number // omit for the fast airtime path (adapter auto-detects)
  amount: number // recipient's local currency amount
  countryCode: string
  recipientNumber: string
  transactionPin: string
}

export interface PurchaseResult {
  success: boolean
  orderId?: string
  message: string
  chargedAmountKobo?: number
  newBalanceKobo?: number
  deliveredAmount?: number
  deliveredAmountCurrency?: string
}

export async function purchaseInternationalTopup(params: PurchaseParams, nativeDB?: any): Promise<PurchaseResult> {
  // 1. Feature flag gate — same convention as every other VTU service.
  if (!(await isFeatureEnabled("service_international_topup", nativeDB))) {
    return { success: false, message: "This service is currently unavailable. Please try again later." }
  }

  // 2. Verify transaction PIN — real money leaves the wallet here, same
  // requirement as every purchase path in runPurchaseFlow.ts.
  const userResult = await d1Query(
    "SELECT transaction_pin_hash FROM users WHERE id = ?",
    [params.userId],
    nativeDB,
  )
  const user = userResult.results?.[0]
  if (!user) return { success: false, message: "User not found" }
  if (!user.transaction_pin_hash) {
    return { success: false, message: "Please set a transaction PIN before making purchases" }
  }
  if (!verifyPin(params.transactionPin, user.transaction_pin_hash)) {
    return { success: false, message: "Incorrect transaction PIN" }
  }

  // 3. Resolve the active provider (neutral — see resolveProvider above).
  const resolved = await resolveProvider(nativeDB)
  if (!resolved) {
    return { success: false, message: "International top-up is not available right now" }
  }
  const credentials = await getVtuProviderCredentials(resolved.providerKey, nativeDB)

  // 4. Get a fresh FX quote right before charging — rates move, so we
  // never trust an earlier preview for the actual debit amount.
  const markupPct = await getSettingNumber("international_topup_markup_pct", 5, nativeDB)
  let providerChargeKobo: number
  let resolvedOperatorId = params.operatorId
  try {
    if (resolvedOperatorId !== undefined) {
      const quote = await resolved.adapter.previewFxRate(resolvedOperatorId, params.amount, credentials)
      providerChargeKobo = quote.chargedToUserKobo
    } else {
      // Fast airtime path — no operator_id yet, so there's no
      // standalone quote endpoint to call without one. We proceed to
      // purchase() directly (VTUGate auto-detects + charges
      // atomically) and use ITS returned charged_to_user as the
      // authoritative amount, debiting the wallet after the fact. This
      // mirrors VTUGate's own documented "fast path" semantics.
      providerChargeKobo = 0
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Could not fetch a live FX quote",
    }
  }

  const internalReference = `intl-${randomUUID()}`

  // 5a. Controlled path (operator_id known ahead of time, e.g. data
  // bundles or a user who saw a preview): debit BEFORE calling the
  // provider, same "debit then refund on failure" order every other
  // purchase in this codebase uses.
  if (resolvedOperatorId !== undefined) {
    const chargeKobo = applyMarkup(providerChargeKobo, markupPct)
    const debit = await debitWallet(
      {
        userId: params.userId,
        amountKobo: chargeKobo,
        type: "purchase",
        reference: internalReference,
        metadata: { service: "international_topup", countryCode: params.countryCode },
      },
      nativeDB,
    )
    if (!debit.success) {
      return { success: false, message: debit.message ?? "Insufficient wallet balance" }
    }

    const orderId = await createPendingOrder(
      {
        userId: params.userId,
        providerKey: resolved.providerKey,
        operatorId: resolvedOperatorId,
        countryCode: params.countryCode,
        recipientNumber: params.recipientNumber,
        requestedAmount: params.amount,
        chargedAmountKobo: chargeKobo,
        providerChargeKobo,
        internalReference,
      },
      nativeDB,
    )

    const result = await resolved.adapter.purchase(
      {
        operatorId: resolvedOperatorId,
        amount: params.amount,
        countryCode: params.countryCode,
        recipientNumber: params.recipientNumber,
        internalReference,
      },
      credentials,
    )

    if (!result.success) {
      await refundWallet(
        { userId: params.userId, amountKobo: chargeKobo, reference: `refund-${internalReference}`, relatedOrderId: orderId },
        nativeDB,
      )
      await finalizeOrder(orderId, "failed", result, nativeDB)
      return { success: false, message: result.message }
    }

    // Provider's authoritative charge may differ slightly from our
    // pre-quote (rate moved between preview and buy) — true up the
    // wallet if so, rather than silently eating or pocketing the
    // difference.
    if (result.chargedToUserKobo && result.chargedToUserKobo !== providerChargeKobo) {
      const trueChargeKobo = applyMarkup(result.chargedToUserKobo, markupPct)
      const diff = trueChargeKobo - chargeKobo
      if (diff > 0) {
        await debitWallet(
          { userId: params.userId, amountKobo: diff, type: "purchase", reference: `${internalReference}-adj`, relatedOrderId: orderId },
          nativeDB,
        )
      } else if (diff < 0) {
        await refundWallet(
          { userId: params.userId, amountKobo: -diff, reference: `${internalReference}-adj`, relatedOrderId: orderId },
          nativeDB,
        )
      }
    }

    await finalizeOrder(orderId, "success", result, nativeDB)
    const balance = await d1Query("SELECT balance_kobo FROM wallets WHERE user_id = ?", [params.userId], nativeDB)

    return {
      success: true,
      orderId,
      message: result.message,
      chargedAmountKobo: chargeKobo,
      newBalanceKobo: balance.results?.[0]?.balance_kobo ?? undefined,
      deliveredAmount: result.deliveredAmount,
      deliveredAmountCurrency: result.deliveredAmountCurrency,
    }
  }

  // 5b. Fast path (no operator_id — pure airtime by phone+country):
  // the provider auto-detects the operator AND charges atomically in
  // one call, so we can't debit first without knowing the amount. We
  // call purchase() first, then debit using the provider's own
  // authoritative charged_to_user from the response.
  const orderId = await createPendingOrder(
    {
      userId: params.userId,
      providerKey: resolved.providerKey,
      operatorId: 0, // unknown until the provider responds — updated in finalizeOrder
      countryCode: params.countryCode,
      recipientNumber: params.recipientNumber,
      requestedAmount: params.amount,
      chargedAmountKobo: 0,
      providerChargeKobo: 0,
      internalReference,
    },
    nativeDB,
  )

  const result = await resolved.adapter.purchase(
    {
      amount: params.amount,
      countryCode: params.countryCode,
      recipientNumber: params.recipientNumber,
      internalReference,
    },
    credentials,
  )

  if (!result.success) {
    await finalizeOrder(orderId, "failed", result, nativeDB)
    return { success: false, message: result.message }
  }

  const providerChargeFinalKobo = result.chargedToUserKobo ?? 0
  const chargeKobo = applyMarkup(providerChargeFinalKobo, markupPct)

  const debit = await debitWallet(
    {
      userId: params.userId,
      amountKobo: chargeKobo,
      type: "purchase",
      reference: internalReference,
      relatedOrderId: orderId,
      metadata: { service: "international_topup", countryCode: params.countryCode },
    },
    nativeDB,
  )

  if (!debit.success) {
    // Provider already sent the money — we cannot claw that back. Flag
    // for manual reconciliation rather than pretending this succeeded
    // cleanly or silently letting the user keep an un-debited top-up.
    await d1Query(
      `UPDATE international_topup_orders
       SET status = 'success', failure_reason = 'wallet_debit_failed_post_delivery', updated_at = datetime('now')
       WHERE id = ?`,
      [orderId],
      nativeDB,
    )
    return {
      success: true,
      orderId,
      message: `${result.message} (billing issue on our side — support has been notified)`,
      deliveredAmount: result.deliveredAmount,
      deliveredAmountCurrency: result.deliveredAmountCurrency,
    }
  }

  await d1Query(
    `UPDATE international_topup_orders
     SET operator_id = ?, operator_name = ?, charged_amount_kobo = ?, provider_charge_kobo = ?,
         status = 'success', provider_reference = ?, provider_reference_2 = ?, raw_response = ?,
         delivered_amount = ?, delivered_amount_currency = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      result.operatorId ?? 0,
      result.operatorName ?? null,
      chargeKobo,
      providerChargeFinalKobo,
      result.providerTransactionId ?? null,
      result.providerTransactionId2 ?? null,
      JSON.stringify(result.raw ?? {}),
      result.deliveredAmount ?? null,
      result.deliveredAmountCurrency ?? null,
      orderId,
    ],
    nativeDB,
  )

  return {
    success: true,
    orderId,
    message: result.message,
    chargedAmountKobo: chargeKobo,
    newBalanceKobo: debit.newBalanceKobo,
    deliveredAmount: result.deliveredAmount,
    deliveredAmountCurrency: result.deliveredAmountCurrency,
  }
}

async function createPendingOrder(
  params: {
    userId: string
    providerKey: string
    operatorId: number
    countryCode: string
    recipientNumber: string
    requestedAmount: number
    chargedAmountKobo: number
    providerChargeKobo: number
    internalReference: string
  },
  nativeDB?: any,
): Promise<string> {
  const id = randomUUID()
  await d1Query(
    `INSERT INTO international_topup_orders
      (id, user_id, provider_key, operator_id, country_code, recipient_number, requested_amount,
       requested_amount_currency, charged_amount_kobo, provider_charge_kobo, status, internal_reference)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'N/A', ?, ?, 'pending', ?)`,
    [
      id,
      params.userId,
      params.providerKey,
      params.operatorId,
      params.countryCode,
      params.recipientNumber,
      params.requestedAmount,
      params.chargedAmountKobo,
      params.providerChargeKobo,
      params.internalReference,
    ],
    nativeDB,
  )
  return id
}

async function finalizeOrder(
  orderId: string,
  status: "success" | "failed",
  result: { message: string; raw?: unknown; deliveredAmount?: number; deliveredAmountCurrency?: string; providerTransactionId?: string; providerTransactionId2?: string },
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE international_topup_orders
     SET status = ?, failure_reason = ?, provider_reference = ?, provider_reference_2 = ?,
         raw_response = ?, delivered_amount = ?, delivered_amount_currency = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      status,
      status === "failed" ? result.message : null,
      result.providerTransactionId ?? null,
      result.providerTransactionId2 ?? null,
      JSON.stringify(result.raw ?? {}),
      result.deliveredAmount ?? null,
      result.deliveredAmountCurrency ?? null,
      orderId,
    ],
    nativeDB,
  )
}
