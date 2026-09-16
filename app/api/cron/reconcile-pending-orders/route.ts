// app/api/cron/reconcile-pending-orders/route.ts
// Resolves every VTU order stuck in "pending" — for ANY provider,
// ANY service type — by calling that order's own provider adapter's
// checkStatus(). This is the fix for "site says successful, provider
// still shows processing": purchaseFlow.ts now saves a status of
// "pending" (not "success") whenever an adapter reports isPending, and
// this cron is what eventually resolves it to a real outcome.
//
// Provider-neutral by construction: it reads provider_used off the
// order row and looks up that adapter in the same VTU_PROVIDER_REGISTRY
// every purchase already goes through — no provider-specific branching
// here, and no code changes needed when a new provider is added later.
//
// Vercel: add to vercel.json  { "crons": [{ "path": "/api/cron/reconcile-pending-orders", "schedule": "*/5 * * * *" }] }
// Cloudflare: add a Cron Trigger in wrangler.toml that fetches this URL every 5 minutes.
// Any other host: point any scheduler at this URL every 5 minutes.

import { NextRequest, NextResponse } from "next/server"
import { getVtuAdapter } from "@/src/services/providers/vtu/registry"
import { getVtuProviderCredentials } from "@/src/services/config"
import { getPendingOrders, resolvePendingOrder } from "@/src/services/vtuOrders"
import { refundWallet } from "@/src/services/wallet"
import { awardCashbackForOrder } from "@/src/services/cashback"
import { maybeAwardReferralBonus } from "@/src/services/referral"
import { sendPurchaseReceiptEmail } from "@/src/services/email"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pendingOrders = await getPendingOrders(2, 100)
  const results: Array<{ orderId: string; providerUsed: string | null; resolvedTo: string; message: string }> = []

  for (const order of pendingOrders) {
    const providerKey = order.provider_used as string | null
    const providerReference = order.provider_reference as string | null

    if (!providerKey || !providerReference) {
      results.push({
        orderId: order.id,
        providerUsed: providerKey,
        resolvedTo: "skipped",
        message: "Missing provider_used or provider_reference — cannot requery",
      })
      continue
    }

    const adapter = getVtuAdapter(providerKey)
    if (!adapter) {
      results.push({
        orderId: order.id,
        providerUsed: providerKey,
        resolvedTo: "skipped",
        message: "No adapter registered for this provider key",
      })
      continue
    }

    try {
      const credentials = await getVtuProviderCredentials(providerKey)
      const statusResult = await adapter.checkStatus(providerReference, credentials)

      // Still genuinely pending (or this provider has no requery
      // endpoint at all, e.g. ConnectBridge — see its checkStatus
      // comment) — leave the order as-is and try again next run.
      if (statusResult.status === "pending") {
        results.push({ orderId: order.id, providerUsed: providerKey, resolvedTo: "still_pending", message: statusResult.message })
        continue
      }

      await resolvePendingOrder(order.id, {
        status: statusResult.status,
        deliveredData: statusResult.deliveredData,
        failureReason: statusResult.status === "failed" ? statusResult.message : undefined,
      })

      const userResult = await d1Query("SELECT email, id FROM users WHERE id = ?", [order.user_id])
      const user = userResult.results?.[0]

      if (statusResult.status === "failed") {
        await refundWallet({
          userId: order.user_id,
          amountKobo: order.amount_kobo,
          reference: `ZPREF-${order.id}`,
          relatedOrderId: order.id,
        })
      } else {
        // Now genuinely confirmed successful — award cashback/referral,
        // same as the synchronous path in purchaseFlow.ts does for an
        // immediately-successful order.
        await awardCashbackForOrder({
          userId: order.user_id,
          orderId: order.id,
          purchaseAmountKobo: order.amount_kobo,
        })
        await maybeAwardReferralBonus(order.user_id).catch((err) =>
          console.error("[reconcile-pending-orders] Referral bonus award failed:", err),
        )
      }

      if (user?.email) {
        sendPurchaseReceiptEmail(user.email, {
          serviceType: order.service_type,
          recipient: order.recipient,
          amountNaira: order.amount_kobo / 100,
          status: statusResult.status,
        }).catch((err) => console.error("[reconcile-pending-orders] Receipt email failed:", err))
      }

      results.push({ orderId: order.id, providerUsed: providerKey, resolvedTo: statusResult.status, message: statusResult.message })
    } catch (err) {
      results.push({
        orderId: order.id,
        providerUsed: providerKey,
        resolvedTo: "error",
        message: err instanceof Error ? err.message : "Unexpected error during reconciliation",
      })
    }
  }

  return NextResponse.json({ checked: pendingOrders.length, results })
}
