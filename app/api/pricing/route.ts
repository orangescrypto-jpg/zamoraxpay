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
import { listPlans, listPlanGroups, lookupPrice } from "@/src/services/pricing"
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

  // PERF FIX (audit finding: "pricing plans never cached"): every buy
  // screen fetched this route fresh on each mount AND on every network
  // change — the hottest authenticated path in the app (a Supabase
  // session check, a users-tier query and up to three pricing queries
  // per hit). The route is tier-scoped, so the browser is only allowed
  // to reuse it for this user's session, and only briefly: private
  // (never a shared CDN — the response embeds reseller-tier pricing)
  // with a 60s max-age + 5-minute stale-while-revalidate window.
  // Pricing changes are rare and non-critical (the purchase flow
  // re-verifies the price server-side via expectedPriceKobo), so a
  // minute-old plan list is always safe to render from.
  const cacheHeaders = {
    "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    Vary: "Authorization",
  }

  const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
  const tier = (userResult.results?.[0]?.tier as "retail" | "reseller" | undefined) ?? "retail"

  if (flat) {
    const price = await lookupPrice(serviceType, networkOrBiller, null, tier)
    if (!price.found) return NextResponse.json({ priceKobo: null }, { headers: cacheHeaders })
    return NextResponse.json({ priceKobo: price.chargeAmountKobo }, { headers: cacheHeaders })
  }

  const grouped = req.nextUrl.searchParams.get("grouped") === "1"
  if (grouped) {
    const groups = await listPlanGroups(serviceType, networkOrBiller, tier)
    return NextResponse.json({ groups }, { headers: cacheHeaders })
  }

  const plans = await listPlans(serviceType, networkOrBiller, tier)
  return NextResponse.json({ plans }, { headers: cacheHeaders })
}
