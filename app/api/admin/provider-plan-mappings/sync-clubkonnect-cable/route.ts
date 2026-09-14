// app/api/admin/provider-plan-mappings/sync-clubkonnect-cable/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { syncClubkonnectCablePlans } from "@/src/services/providerPlanSync"
import { getVtuProviderCredentials } from "@/src/services/config"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const credentials = await getVtuProviderCredentials("clubkonnect")
    const result = await syncClubkonnectCablePlans(auth.uid, credentials)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    )
  }
}
