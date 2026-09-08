// app/api/cron/auto-reload/route.ts
// Executes every auto-reload rule whose next_run_at has passed.
// Call this from an external scheduler (Vercel Cron, Cloudflare
// Cron Trigger, or any hosting-agnostic cron service) — protected by
// a shared secret since it's not meant to be user-triggered.
//
// Vercel: add to vercel.json  { "crons": [{ "path": "/api/cron/auto-reload", "schedule": "0 * * * *" }] }
// Cloudflare: add a Cron Trigger in wrangler.toml that fetches this URL.
// Any other host: point any scheduler (cron job, GitHub Actions, etc.) at this URL hourly.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/db"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"
import { hashPin } from "@/src/services/pin"

function computeNextRun(frequency: string, from: Date): string {
  const next = new Date(from)
  if (frequency === "daily") next.setDate(next.getDate() + 1)
  else if (frequency === "weekly") next.setDate(next.getDate() + 7)
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1)
  return next.toISOString()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date().toISOString()
  const dueRules = await d1Query(
    `SELECT r.*, b.recipient, b.network_or_biller FROM auto_reload_rules r
     JOIN beneficiaries b ON b.id = r.beneficiary_id
     WHERE r.is_active = 1 AND r.next_run_at <= ?`,
    [now],
  )

  const results: Array<{ ruleId: string; success: boolean; message: string }> = []

  for (const rule of dueRules.results ?? []) {
    try {
      // Auto-reload bypasses the transaction-PIN prompt (no user present
      // to type it), so we verify against a system-known constant only
      // in the sense that runPurchaseFlow's PIN check is skipped here by
      // calling the wallet/router logic directly would duplicate too
      // much — instead we reuse runPurchaseFlow but pass through the
      // user's OWN pin hash comparison bypassed via a dedicated flag.
      // Simpler and safer: auto-reload rules are opt-in and pre-authorized
      // by the user at creation time, so we skip PIN re-entry by design.
      const userResult = await d1Query("SELECT transaction_pin_hash FROM users WHERE id = ?", [rule.user_id])
      const pinHash = userResult.results?.[0]?.transaction_pin_hash

      if (!pinHash) {
        results.push({ ruleId: rule.id, success: false, message: "No transaction PIN set; skipping" })
        continue
      }

      // Auto-reload is pre-authorized at rule-creation time (the user set
      // up the schedule deliberately), so we don't require live PIN entry
      // for each scheduled run — this mirrors how most recurring-payment
      // systems work (initial consent, no re-auth per cycle).
      const result = await runPurchaseFlowForAutoReload(rule)
      results.push({ ruleId: rule.id, success: result.success, message: result.message })

      await d1Query(
        "UPDATE auto_reload_rules SET next_run_at = ?, updated_at = datetime('now') WHERE id = ?",
        [computeNextRun(rule.frequency, new Date()), rule.id],
      )
    } catch (err) {
      results.push({
        ruleId: rule.id,
        success: false,
        message: err instanceof Error ? err.message : "Unexpected error",
      })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

// Internal helper: runs the purchase flow for an auto-reload rule
// without requiring live PIN entry (see comment above). It still goes
// through the same wallet debit / VTU router / refund-on-failure path
// as a manual purchase — only the PIN gate is bypassed, since consent
// was already given when the rule was created.
async function runPurchaseFlowForAutoReload(rule: any) {
  const userResult = await d1Query("SELECT transaction_pin_hash FROM users WHERE id = ?", [rule.user_id])
  const pinHash = userResult.results?.[0]?.transaction_pin_hash

  // We don't have the plaintext PIN (correctly — it's never stored), so
  // runPurchaseFlow's PIN check can't be reused verbatim for a
  // non-interactive cron context. Rather than weaken that shared
  // function's security contract for manual purchases, auto-reload logic
  // is intentionally NOT routed through verifyPin here — the rule's
  // existence IS the authorization for scheduled runs.
  const { lookupPrice } = await import("@/src/services/pricing")
  const { createPendingOrder, finalizeOrder } = await import("@/src/services/vtuOrders")
  const { debitWallet, refundWallet } = await import("@/src/services/wallet")
  const { executeVtuPurchase } = await import("@/src/services/vtuRouter")

  const tierResult = await d1Query("SELECT tier FROM users WHERE id = ?", [rule.user_id])
  const tier = tierResult.results?.[0]?.tier ?? "retail"

  const pricing = await lookupPrice(rule.service_type, rule.network_or_biller, rule.plan_code, tier, rule.amount_kobo)
  if (!pricing.found) return { success: false, message: "No pricing configured" }

  const orderId = await createPendingOrder({
    userId: rule.user_id,
    serviceType: rule.service_type,
    networkOrBiller: rule.network_or_biller,
    recipient: rule.recipient,
    planCode: rule.plan_code,
    amountKobo: pricing.chargeAmountKobo,
    baseAmountKobo: pricing.baseAmountKobo,
    convenienceFeeKobo: pricing.convenienceFeeKobo,
    pricingTier: pricing.tierUsed,
    isAutoReload: true,
    autoReloadRuleId: rule.id,
  })

  const debitReference = `ZPORD-${orderId}`
  const debit = await debitWallet({
    userId: rule.user_id,
    amountKobo: pricing.chargeAmountKobo,
    type: "purchase",
    reference: debitReference,
    relatedOrderId: orderId,
  })

  if (!debit.success) {
    await finalizeOrder(orderId, { status: "failed", providerUsed: null, providerReference: null, attempts: [], failureReason: debit.message })
    return { success: false, message: debit.message ?? "Insufficient balance" }
  }

  const routerResult = await executeVtuPurchase({
    serviceType: rule.service_type,
    networkOrBiller: rule.network_or_biller,
    recipient: rule.recipient,
    planCode: rule.plan_code ?? undefined,
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

  if (!routerResult.success) {
    await refundWallet({
      userId: rule.user_id,
      amountKobo: pricing.chargeAmountKobo,
      reference: `ZPREF-${orderId}`,
      relatedOrderId: orderId,
    })
  } else {
    const { awardCashbackForOrder } = await import("@/src/services/cashback")
    await awardCashbackForOrder({
      userId: rule.user_id,
      orderId,
      purchaseAmountKobo: pricing.chargeAmountKobo,
    })
  }

  return { success: routerResult.success, message: routerResult.message }
}
