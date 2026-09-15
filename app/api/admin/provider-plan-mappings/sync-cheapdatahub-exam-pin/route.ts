// app/api/admin/provider-plan-mappings/sync-cheapdatahub-exam-pin/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncCheapdatahubExamPinPrices } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"
import { reconcilePricingFromMappings } from "@/src/services/pricingReconcile"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const credentials = await getVtuProviderCredentials("cheapdatahub")
    const result = await syncCheapdatahubExamPinPrices(auth.uid, credentials)
    await reconcilePricingFromMappings("exam_pin", auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
