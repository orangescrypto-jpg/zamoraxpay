// app/api/vtu/quote/route.ts
// Read-only preview: given a typed amount, returns the convenience
// fee and total the customer would actually be charged. No debit, no
// order created — purely so the buy page can show "amount + fee =
// total" before the customer commits, instead of finding out at the
// PIN step (or after) that a fee was added.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { lookupPrice } from "@/src/services/pricing"
import type { VtuServiceType } from "@/src/types"

const QUOTABLE_SERVICES = new Set<VtuServiceType>(["airtime", "electricity", "betting"])

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { serviceType, networkOrBiller, amountKobo } = await req.json()
    if (!serviceType || !networkOrBiller || !amountKobo) {
      return NextResponse.json(
        { error: "serviceType, networkOrBiller, and amountKobo are required" },
        { status: 400 },
      )
    }
    if (!QUOTABLE_SERVICES.has(serviceType)) {
      return NextResponse.json({ error: "This service does not support quotes" }, { status: 400 })
    }

    const { d1Query } = await import("@/lib/d1")
    const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
    const tier = userResult.results?.[0]?.tier === "reseller" ? "reseller" : "retail"

    const pricing = await lookupPrice(serviceType, networkOrBiller, null, tier, amountKobo)

    return NextResponse.json({
      amountKobo: pricing.baseAmountKobo,
      convenienceFeeKobo: pricing.convenienceFeeKobo,
      totalKobo: pricing.chargeAmountKobo,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not calculate quote" }, { status: 500 })
  }
}
