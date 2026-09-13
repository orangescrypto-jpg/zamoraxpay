// app/api/international-topup/purchase/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { purchaseInternationalTopup } from "@/src/services/internationalTopupService"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { operatorId, amount, countryCode, recipientNumber, transactionPin } = await req.json()
    if (!amount || !countryCode || !recipientNumber || !transactionPin) {
      return NextResponse.json(
        { success: false, message: "amount, countryCode, recipientNumber, and transactionPin are required" },
        { status: 400 },
      )
    }

    const result = await purchaseInternationalTopup({
      userId: auth.uid,
      operatorId: operatorId || undefined,
      amount,
      countryCode,
      recipientNumber,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Purchase failed" },
      { status: 500 },
    )
  }
}
