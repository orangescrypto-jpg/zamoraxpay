// app/api/vtu/betting/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { platform, accountId, amountKobo, transactionPin } = await req.json()
    if (!platform || !accountId || !amountKobo || !transactionPin) {
      return NextResponse.json(
        { error: "platform, accountId, amountKobo, and transactionPin are required" },
        { status: 400 },
      )
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "betting",
      networkOrBiller: platform, // 'BET9JA' | 'SPORTYBET' | etc.
      recipient: accountId,
      requestedAmountKobo: amountKobo,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
