// app/api/admin/analytics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { getDashboardOverview, getServiceBreakdown, getDailyVolume, getProviderPerformance } from "@/src/services/analytics"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const [overview, serviceBreakdown, dailyVolume, providerPerformance] = await Promise.all([
    getDashboardOverview(),
    getServiceBreakdown(),
    getDailyVolume(14),
    getProviderPerformance(),
  ])

  return NextResponse.json({ overview, serviceBreakdown, dailyVolume, providerPerformance })
}
