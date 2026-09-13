// app/api/international-topup/operators/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { listOperators } from "@/src/services/internationalTopupService"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const countryCode = req.nextUrl.searchParams.get("country_code")
  const type = req.nextUrl.searchParams.get("type")
  if (!countryCode) {
    return NextResponse.json({ success: false, message: "country_code is required" }, { status: 400 })
  }

  try {
    const operators = await listOperators(countryCode, type === "data" ? "data" : undefined)
    return NextResponse.json({ success: true, data: operators })
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to fetch operators" },
      { status: 500 },
    )
  }
}
