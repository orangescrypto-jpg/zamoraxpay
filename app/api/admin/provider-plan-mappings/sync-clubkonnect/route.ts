// app/api/admin/provider-plan-mappings/sync-clubkonnect/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncClubkonnectDataPlans } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"
import { reconcilePricingFromMappings } from "@/src/services/pricingReconcile"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const credentials = await getVtuProviderCredentials("clubkonnect")
    const result = await syncClubkonnectDataPlans(auth.uid, credentials)
    // Keep pricing_rules in sync with whatever this sync just wrote to
    // provider_plan_mappings — new plans get auto-priced immediately,
    // existing auto-priced plans get their price refreshed if cost
    // changed. Manually-overridden plans are untouched (see
    // pricingReconcile.ts).
    await reconcilePricingFromMappings("data", auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
