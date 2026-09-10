// app/api/vtu/exam-pin/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { examBody, pinType, quantity, transactionPin } = await req.json()
    if (!examBody || !pinType || !quantity || !transactionPin) {
      return NextResponse.json(
        { error: "examBody, pinType, quantity, and transactionPin are required" },
        { status: 400 },
      )
    }
    if (pinType !== "registration" && pinType !== "result_checker") {
      return NextResponse.json({ error: "pinType must be 'registration' or 'result_checker'" }, { status: 400 })
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "exam_pin",
      networkOrBiller: examBody, // 'WAEC' | 'NECO' | 'JAMB' | 'NABTEB'
      recipient: "self", // no per-user recipient number for PINs
      planCode: pinType, // "registration" | "result_checker" — real plan code now, drives pricing + provider plan mapping
      quantity,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
