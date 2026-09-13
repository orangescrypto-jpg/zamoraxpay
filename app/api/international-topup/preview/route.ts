// app/api/international-topup/preview/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { previewFx } from "@/src/services/internationalTopupService"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { operatorId, amount } = await req.json()
    if (!operatorId || !amount) {
      return NextResponse.json({ success: false, message: "operatorId and amount are required" }, { status: 400 })
    }

    const preview = await previewFx(operatorId, amount)
    return NextResponse.json({ success: true, data: preview })
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to fetch FX preview" },
      { status: 500 },
    )
  }
}
