// app/api/vtu/airtime/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { network, phone, amountKobo, transactionPin } = await req.json()
    if (!network || !phone || !amountKobo || !transactionPin) {
      return NextResponse.json({ error: "network, phone, amountKobo, and transactionPin are required" }, { status: 400 })
    }

    const MIN_AIRTIME_KOBO = 5000 // ₦50 minimum
    if (amountKobo < MIN_AIRTIME_KOBO) {
      return NextResponse.json({ error: "Minimum airtime purchase is ₦50" }, { status: 400 })
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "airtime",
      networkOrBiller: network,
      recipient: phone,
      requestedAmountKobo: amountKobo,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
