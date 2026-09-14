// app/api/admin/pricing-policies/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { listPricingPolicies, updatePricingPolicy, type FeeType } from "@/src/services/pricingPolicies"
import { reconcilePricingFromMappings } from "@/src/services/pricingReconcile"
import type { VtuServiceType } from "@/src/types"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const policies = await listPricingPolicies()
  return NextResponse.json({ policies })
}

// Saving a policy immediately reconciles every auto-priced plan under
// that service_type — this IS the "apply the new fee to all plans"
// action the admin expects when they hit save, not a separate step.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const serviceType = body.serviceType as VtuServiceType
    const retailFeeType = body.retailFeeType as FeeType
    const retailFeeValue = Number(body.retailFeeValue)
    const wholesaleFeeType = body.wholesaleFeeType as FeeType
    const wholesaleFeeValue = Number(body.wholesaleFeeValue)
    const convenienceFeeType = body.convenienceFeeType as FeeType
    const convenienceFeeValue = Number(body.convenienceFeeValue)

    if (!serviceType) {
      return NextResponse.json({ error: "serviceType is required" }, { status: 400 })
    }
    if (![retailFeeValue, wholesaleFeeValue, convenienceFeeValue].every((v) => Number.isFinite(v) && v >= 0)) {
      return NextResponse.json({ error: "Fee values must be non-negative numbers" }, { status: 400 })
    }
    if (![retailFeeType, wholesaleFeeType, convenienceFeeType].every((t) => t === "flat" || t === "percentage")) {
      return NextResponse.json({ error: "Fee type must be 'flat' or 'percentage'" }, { status: 400 })
    }

    await updatePricingPolicy(
      {
        serviceType,
        retailFeeType,
        retailFeeValue,
        wholesaleFeeType,
        wholesaleFeeValue,
        convenienceFeeType,
        convenienceFeeValue,
      },
      auth.uid,
    )

    const result = await reconcilePricingFromMappings(serviceType, auth.uid)

    return NextResponse.json({ success: true, reconciled: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save pricing policy" },
      { status: 500 },
    )
  }
}
