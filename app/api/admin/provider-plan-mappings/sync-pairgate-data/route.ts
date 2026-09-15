// app/api/admin/provider-plan-mappings/sync-pairgate-data/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncPairgateDataPlans } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"
import { reconcilePricingFromMappings } from "@/src/services/pricingReconcile"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const credentials = await getVtuProviderCredentials("pairgate")
    const result = await syncPairgateDataPlans(auth.uid, credentials)
    await reconcilePricingFromMappings("data", auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
