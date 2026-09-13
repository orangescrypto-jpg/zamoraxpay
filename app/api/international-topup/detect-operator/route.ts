// app/api/international-topup/detect-operator/route.ts
// Returns { success: true, data: null } (not an error) when detection
// fails — that's a normal outcome (unrecognized/ported number), and the
// UI should fall back to a manual operator picker rather than showing
// an error state.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { detectOperator } from "@/src/services/internationalTopupService"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { phoneNumber, countryCode } = await req.json()
    if (!phoneNumber || !countryCode) {
      return NextResponse.json({ success: false, message: "phoneNumber and countryCode are required" }, { status: 400 })
    }

    const operator = await detectOperator(phoneNumber, countryCode)
    return NextResponse.json({ success: true, data: operator })
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Detection failed" },
      { status: 500 },
    )
  }
}
