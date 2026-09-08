// app/api/pricing/route.ts
// Public, customer-facing pricing lookup. Unlike /api/admin/pricing
// (admin-only, returns every column including wholesale cost), this
// route:
//   - requires only a logged-in customer session, not admin
//   - returns retail-tier price (or wholesale, if the caller is a
//     reseller) — never both, and never the raw pricing_rules row
//   - only returns active rules, so customers never see or select
//     a plan an admin has disabled
//
// Every service page (data, cable, ...) should fetch from here
// instead of hardcoding plan lists or prices.

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import type { VtuServiceType } from "@/src/types"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType") as VtuServiceType | null
  const networkOrBiller = req.nextUrl.searchParams.get("networkOrBiller")

  if (!serviceType || !networkOrBiller) {
    return NextResponse.json({ error: "serviceType and networkOrBiller are required" }, { status: 400 })
  }

  const userResult = await d1Query("SELECT tier FROM users WHERE id = ? LIMIT 1", [auth.uid])
  const tier: "retail" | "reseller" = (userResult.results?.[0] as any)?.tier === "reseller" ? "reseller" : "retail"

  const rulesResult = await d1Query(
    `SELECT plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo
     FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1
     ORDER BY retail_price_kobo ASC`,
    [serviceType, networkOrBiller],
  )

  const plans = (rulesResult.results ?? []).map((rule: any) => {
    const baseKobo = tier === "reseller" ? rule.wholesale_price_kobo : rule.retail_price_kobo
    return {
      planCode: rule.plan_code as string | null,
      priceKobo: baseKobo + rule.convenience_fee_kobo,
    }
  })

  return NextResponse.json({ plans, tier })
}
