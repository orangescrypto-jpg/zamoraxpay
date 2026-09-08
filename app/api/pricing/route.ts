// app/api/pricing/route.ts
// Public (customer-facing) pricing lookup used by the buy-data / buy-cable
// pages. Returns only { plans: [{ planCode, priceKobo }] } for the
// caller's own tier — never the admin rules list. Admin CRUD lives at
// app/api/admin/pricing/route.ts and stays behind requireAdmin.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { listPlans } from "@/src/services/pricing"
import type { VtuServiceType } from "@/src/types"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType") as VtuServiceType | null
  const networkOrBiller = req.nextUrl.searchParams.get("networkOrBiller")

  if (!serviceType || !networkOrBiller) {
    return NextResponse.json({ error: "serviceType and networkOrBiller are required" }, { status: 400 })
  }

  const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
  const tier = (userResult.results?.[0]?.tier as "retail" | "reseller" | undefined) ?? "retail"

  const plans = await listPlans(serviceType, networkOrBiller, tier)
  return NextResponse.json({ plans })
}
