// app/api/vtu/electricity/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { biller, meterNumber, amountKobo, meterType, transactionPin } = await req.json()
    if (!biller || !meterNumber || !amountKobo || !transactionPin) {
      return NextResponse.json(
        { error: "biller, meterNumber, amountKobo, and transactionPin are required" },
        { status: 400 },
      )
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "electricity",
      networkOrBiller: biller,
      recipient: meterNumber,
      planCode: meterType ?? null, // 'prepaid' | 'postpaid'
      requestedAmountKobo: amountKobo,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
