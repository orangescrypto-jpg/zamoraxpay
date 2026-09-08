// app/api/admin/withdrawals/[id]/reject/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { rejectWithdrawal } from "@/src/services/withdrawals"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params

  try {
    const { reason } = await req.json()
    if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 })

    await rejectWithdrawal(id, reason, auth.uid)
    return NextResponse.json({ success: true, message: "Withdrawal rejected and refunded to wallet" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rejection failed" }, { status: 500 })
  }
}
