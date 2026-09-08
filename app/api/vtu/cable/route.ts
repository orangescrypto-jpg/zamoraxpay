// app/api/vtu/cable/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { biller, smartcardNumber, planCode, transactionPin } = await req.json()
    if (!biller || !smartcardNumber || !planCode || !transactionPin) {
      return NextResponse.json(
        { error: "biller, smartcardNumber, planCode, and transactionPin are required" },
        { status: 400 },
      )
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "cable",
      networkOrBiller: biller,
      recipient: smartcardNumber,
      planCode,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
