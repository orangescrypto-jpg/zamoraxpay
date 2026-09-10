// app/api/vtu/epin/route.ts
//
// Network recharge-card ePINs (MTN/Glo/Airtel/9mobile) — distinct from
// exam-pin (WAEC/NECO/NABTEB). Mirrors app/api/vtu/exam-pin/route.ts's
// shape since both are quantity-aware, plan-coded PIN purchases, but
// they are NOT the same product and are kept as separate routes/service
// types (see src/types/index.ts's VtuServiceType and
// src/services/providers/vtu/vtung.ts's docstring).
//
// Today VTU.ng is the only registered adapter that implements "epin"
// (see vtung.ts) — but this route, like every other checkout route,
// calls ONLY the neutral router (runPurchaseFlow -> executeVtuPurchase).
// It never references VTU.ng directly, so if/when another provider adds
// epin support, it's picked up automatically with zero changes here.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { runPurchaseFlow } from "@/src/services/purchaseFlow"

const VALID_DENOMINATIONS = new Set(["100", "200", "500"])
const VALID_NETWORKS = new Set(["mtn", "airtel", "glo", "9mobile"])

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { network, denomination, quantity, transactionPin } = await req.json()
    if (!network || !denomination || !quantity || !transactionPin) {
      return NextResponse.json(
        { error: "network, denomination, quantity, and transactionPin are required" },
        { status: 400 },
      )
    }
    if (!VALID_NETWORKS.has(String(network).toLowerCase())) {
      return NextResponse.json({ error: "network must be one of: mtn, airtel, glo, 9mobile" }, { status: 400 })
    }
    if (!VALID_DENOMINATIONS.has(String(denomination))) {
      return NextResponse.json({ error: "denomination must be one of: 100, 200, 500" }, { status: 400 })
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 40) {
      return NextResponse.json({ error: "quantity must be an integer between 1 and 40" }, { status: 400 })
    }

    const result = await runPurchaseFlow({
      userId: auth.uid,
      serviceType: "epin",
      networkOrBiller: network, // 'mtn' | 'airtel' | 'glo' | '9mobile'
      recipient: "self", // no per-user recipient number for PINs, same as exam_pin
      planCode: String(denomination), // "100" | "200" | "500" — drives pricing + provider plan mapping
      quantity,
      transactionPin,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 })
  }
}
