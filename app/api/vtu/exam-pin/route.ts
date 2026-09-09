// app/api/vtu/exam-pin/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { examBody, quantity, transactionPin } = await req.json()
    if (!examBody || !quantity || !transactionPin) {
      return NextResponse.json({ error: "examBody, quantity, and transactionPin are required" }, { status: 400 })
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "exam_pin",
      networkOrBiller: examBody, // 'WAEC' | 'NECO' | 'JAMB' | 'NABTEB'
      recipient: `${quantity}x`, // no per-user recipient number for PINs; quantity is the "recipient" field
      planCode: String(quantity), // carried through to provider adapters as quantity — NOT used for pricing, see purchaseFlow.ts
      quantity,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
