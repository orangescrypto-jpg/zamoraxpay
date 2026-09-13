// app/api/international-topup/countries/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { listCountries } from "@/src/services/internationalTopupService"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const countries = await listCountries()
    return NextResponse.json({ success: true, data: countries })
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to fetch countries" },
      { status: 500 },
    )
  }
}

