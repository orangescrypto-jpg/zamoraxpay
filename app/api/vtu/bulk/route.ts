// app/api/vtu/bulk/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runBulkPurchase, type BulkPurchaseParams } from "@/src/services/bulkPurchaseFlow"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { serviceType, batchId, transactionPin } = body

    if (!serviceType || !batchId || !transactionPin) {
      return NextResponse.json(
        { error: "serviceType, batchId, and transactionPin are required" },
        { status: 400 },
      )
    }

    let params: BulkPurchaseParams

    if (serviceType === "airtime") {
      const { amountKobo } = body
      if (!amountKobo) {
        return NextResponse.json({ error: "amountKobo is required for bulk airtime" }, { status: 400 })
      }
      const MIN_AIRTIME_KOBO = 5000 // ₦50 minimum — same floor as the single-purchase route
      if (amountKobo < MIN_AIRTIME_KOBO) {
        return NextResponse.json({ error: "Minimum airtime purchase is ₦50" }, { status: 400 })
      }
      params = {
        userId: auth.uid,
        serviceType: "airtime",
        batchId,
        amountKobo,
        transactionPin,
      }
    } else if (serviceType === "data") {
      const { network, planCode } = body
      if (!network || !planCode) {
        return NextResponse.json({ error: "network and planCode are required for bulk data" }, { status: 400 })
      }
      params = {
        userId: auth.uid,
        serviceType: "data",
        batchId,
        network,
        planCode,
        transactionPin,
      }
    } else {
      return NextResponse.json({ error: "serviceType must be 'airtime' or 'data'" }, { status: 400 })
    }

    const result = await runBulkPurchase(params)

    // A whole-run failure (bad PIN, batch not found, empty batch) sets
    // `message` and leaves `items` empty — surface that as a 400 like
    // the single-purchase routes do. Once the run actually starts,
    // per-item failures still come back as 200 with success: true at
    // the run level (the batch was processed; some entries just
    // failed) — the UI reads successCount/failureCount/items to show
    // the breakdown.
    const isWholeRunFailure = !result.success && result.items.length === 0
    return NextResponse.json(result, { status: isWholeRunFailure ? 400 : 200 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bulk purchase failed" }, { status: 500 })
  }
}
