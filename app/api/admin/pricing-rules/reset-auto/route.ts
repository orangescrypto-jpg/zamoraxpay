// app/api/admin/pricing-rules/reset-auto/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { resetPlanToAutoPricing } from "@/src/services/pricingReconcile"
import type { VtuServiceType } from "@/src/types"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const serviceType = body.serviceType as VtuServiceType
    const networkOrBiller = body.networkOrBiller as string
    const planCode = body.planCode as string

    if (!serviceType || !networkOrBiller || !planCode) {
      return NextResponse.json(
        { error: "serviceType, networkOrBiller, and planCode are required" },
        { status: 400 },
      )
    }

    await resetPlanToAutoPricing(serviceType, networkOrBiller, planCode, auth.uid)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 },
    )
  }
}
