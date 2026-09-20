// app/api/cron/reconcile-orphaned-orders/route.ts
// Companion to /api/cron/reconcile-pending-orders.
//
// That route resolves pending orders that HAVE a provider_reference.
// This one handles the ones it can never see: orders stuck in 'pending'
// with NO provider_reference, where the customer's wallet was already
// debited but the request died before the outcome was recorded.
// See src/services/orphanedOrders.ts for the full reasoning — in short,
// it asks the provider first and only refunds on a definite "failed",
// never on silence.
//
// Schedule: every 10-15 minutes via cron-job.org, same as the other
// crons — URL:  https://zamoraxpay.com.ng/api/cron/reconcile-orphaned-orders
// Header:       Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from "next/server"
import { verifyCronAuth } from "@/src/services/cronAuth"
import { getOrphanedOrders, recoverOrphanedOrder, getOrdersNeedingReview } from "@/src/services/orphanedOrders"

export async function GET(req: NextRequest) {
  const authError = await verifyCronAuth(req)
  if (authError) return authError

  const orphans = await getOrphanedOrders(50)
  const results = []

  // Sequential on purpose: each recovery may call a provider's status
  // endpoint, and several providers rate-limit (Pairgate has 429'd us
  // before). Hammering them in parallel would make recovery worse.
  for (const order of orphans) {
    results.push(await recoverOrphanedOrder(order))
  }

  const needingReview = await getOrdersNeedingReview(100)

  return NextResponse.json({
    checked: orphans.length,
    results,
    // Surfaced in the cron-job.org response history so a non-zero count is
    // visible without opening the admin panel.
    needsAdminReview: needingReview.length,
  })
}
