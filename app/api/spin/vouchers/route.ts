// app/api/spin/vouchers/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { claimVoucher, listUserVouchers } from "@/src/services/spinVouchers"

// GET — the user's prizes: free airtime / data vouchers and discount coupons.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error
  try {
    return NextResponse.json({ vouchers: await listUserVouchers(auth.uid) })
  } catch {
    return NextResponse.json({ vouchers: [] })
  }
}

// POST — claim a free airtime / data voucher. Body: { voucherId, recipient, network? }.
// Discount coupons are not claimed here — they apply automatically at checkout.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const body = await req.json().catch(() => ({}))
  if (typeof body?.voucherId !== "string" || typeof body?.recipient !== "string") {
    return NextResponse.json({ success: false, message: "voucherId and recipient are required" }, { status: 400 })
  }

  const result = await claimVoucher({
    userId: auth.uid,
    voucherId: body.voucherId,
    recipient: body.recipient,
    network: typeof body.network === "string" ? body.network : undefined,
  })
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
