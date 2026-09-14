// app/api/admin/provider-plan-mappings/sync-vtugate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncVtugateDataPlans } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const credentials = await getVtuProviderCredentials("vtugate")
    const result = await syncVtugateDataPlans(auth.uid, credentials)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
