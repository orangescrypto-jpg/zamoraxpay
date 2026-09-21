// app/api/admin/spin/log/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { getSpinLog } from "@/src/services/spinAdmin"

// GET ?page=1&source=<sourceKey> — recent spins, payout totals and voucher/ticket counts.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1")
    const sourceKey = req.nextUrl.searchParams.get("source") ?? undefined
    return NextResponse.json(await getSpinLog({ page, sourceKey }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load log" }, { status: 500 })
  }
}
