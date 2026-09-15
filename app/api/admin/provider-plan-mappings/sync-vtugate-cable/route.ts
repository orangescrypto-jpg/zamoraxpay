// app/api/admin/provider-plan-mappings/sync-vtugate-cable/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncVtugateCablePlans } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"
import { reconcilePricingFromMappings } from "@/src/services/pricingReconcile"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { serviceId, smartcardNumber, biller, phone } = body ?? {}
    if (!serviceId || !smartcardNumber || !biller || !phone) {
      return NextResponse.json(
        { error: "serviceId, smartcardNumber, biller, and phone are all required" },
        { status: 400 },
      )
    }

    const credentials = await getVtuProviderCredentials("vtugate")
    const result = await syncVtugateCablePlans(auth.uid, { serviceId, smartcardNumber, biller, phone }, credentials)
    await reconcilePricingFromMappings("cable", auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
