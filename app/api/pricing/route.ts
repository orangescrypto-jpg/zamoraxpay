// app/api/pricing/route.ts
// Public (customer-facing) pricing lookup used by the buy-data / buy-cable
// pages. Returns only { plans: [{ planCode, priceKobo }] } for the
// caller's own tier — never the admin rules list. Admin CRUD lives at
// app/api/admin/pricing/route.ts and stays behind requireAdmin.
//
// Also supports a flat per-unit quote (?flat=1) for services priced
// with a null plan_code, like exam_pin — one price per network/biller,
// not a list of plans. listPlans() filters plan_code IS NOT NULL, so it
// can't answer that; this uses lookupPrice() instead.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { listPlans, lookupPrice } from "@/src/services/pricing"
import type { VtuServiceType } from "@/src/types"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType") as VtuServiceType | null
  const networkOrBiller = req.nextUrl.searchParams.get("networkOrBiller")
  const flat = req.nextUrl.searchParams.get("flat") === "1"

  if (!serviceType || !networkOrBiller) {
    return NextResponse.json({ error: "serviceType and networkOrBiller are required" }, { status: 400 })
  }

  const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
  const tier = (userResult.results?.[0]?.tier as "retail" | "reseller" | undefined) ?? "retail"

  if (flat) {
    const price = await lookupPrice(serviceType, networkOrBiller, null, tier)
    if (!price.found) return NextResponse.json({ priceKobo: null })
    return NextResponse.json({ priceKobo: price.chargeAmountKobo })
  }

  const plans = await listPlans(serviceType, networkOrBiller, tier)
  return NextResponse.json({ plans })
}
