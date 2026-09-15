// app/api/admin/margin-report/route.ts
// Two views of margin exposure, both sourced from real numbers:
//
// 1. Order-level (real, historical): every successful order's
//    amount_kobo (what the customer paid) vs actual_provider_cost_kobo
//    (what the fulfilling provider really cost) — this is ground
//    truth, not an estimate. marginKobo can go negative on a fallback
//    order that landed on a pricier-than-priced-for provider.
//
// 2. Plan-level (forward-looking, from last reconcile): each
//    pricing_rules row's pricing_basis_cost_kobo (what the price was
//    built from — "one below the highest" per selectPricingBasis) vs
//    cheapest_live_cost_kobo (normal case) and worst_live_cost_kobo
//    (true worst case if it falls all the way through). Shows the
//    admin the built-in cushion per plan before any orders even
//    happen.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { searchParams } = new URL(req.url)
  const serviceType = searchParams.get("serviceType")
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500)

  try {
    const orderClauses = ["status = 'success'", "actual_provider_cost_kobo IS NOT NULL"]
    const orderParams: unknown[] = []
    if (serviceType) {
      orderClauses.push("service_type = ?")
      orderParams.push(serviceType)
    }
    const ordersResult = await d1Query(
      `SELECT id, service_type, network_or_biller, plan_code, provider_used,
              amount_kobo, actual_provider_cost_kobo, created_at
       FROM vtu_orders
       WHERE ${orderClauses.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...orderParams, limit],
    )
    const orders: {
      orderId: string
      serviceType: string
      networkOrBiller: string
      planCode: string
      providerUsed: string
      chargedKobo: number
      actualCostKobo: number
      marginKobo: number
      createdAt: string
    }[] = (ordersResult.results ?? []).map((r: any) => ({
      orderId: r.id,
      serviceType: r.service_type,
      networkOrBiller: r.network_or_biller,
      planCode: r.plan_code,
      providerUsed: r.provider_used,
      chargedKobo: r.amount_kobo,
      actualCostKobo: r.actual_provider_cost_kobo,
      marginKobo: r.amount_kobo - r.actual_provider_cost_kobo,
      createdAt: r.created_at,
    }))

    const planClauses = ["auto_priced = 1", "pricing_basis_cost_kobo IS NOT NULL"]
    const planParams: unknown[] = []
    if (serviceType) {
      planClauses.push("service_type = ?")
      planParams.push(serviceType)
    }
    const plansResult = await d1Query(
      `SELECT service_type, network_or_biller, plan_code, retail_price_kobo,
              pricing_basis_provider_key, pricing_basis_cost_kobo,
              cheapest_live_cost_kobo, worst_live_cost_kobo, live_provider_count, updated_at
       FROM pricing_rules
       WHERE ${planClauses.join(" AND ")}
       ORDER BY updated_at DESC`,
      planParams,
    )
    const plans = (plansResult.results ?? []).map((r: any) => ({
      serviceType: r.service_type,
      networkOrBiller: r.network_or_biller,
      planCode: r.plan_code,
      retailPriceKobo: r.retail_price_kobo,
      pricingBasisProviderKey: r.pricing_basis_provider_key,
      pricingBasisCostKobo: r.pricing_basis_cost_kobo,
      cheapestLiveCostKobo: r.cheapest_live_cost_kobo,
      worstLiveCostKobo: r.worst_live_cost_kobo,
      liveProviderCount: r.live_provider_count,
      // Best case: cheapest provider fulfills — margin if nothing falls back.
      bestCaseMarginKobo: r.retail_price_kobo - r.cheapest_live_cost_kobo,
      // Worst case: router falls all the way through to the priciest live provider.
      worstCaseMarginKobo: r.retail_price_kobo - r.worst_live_cost_kobo,
      updatedAt: r.updated_at,
    }))

    const totalOrders = orders.length
    const negativeMarginOrders = orders.filter((o) => o.marginKobo < 0)
    const summary = {
      totalOrders,
      negativeMarginOrderCount: negativeMarginOrders.length,
      totalMarginKobo: orders.reduce((sum, o) => sum + o.marginKobo, 0),
      totalLossFromNegativeOrdersKobo: negativeMarginOrders.reduce((sum, o) => sum + o.marginKobo, 0),
    }

    return NextResponse.json({ summary, orders, plans })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load margin report" },
      { status: 500 },
    )
  }
}
