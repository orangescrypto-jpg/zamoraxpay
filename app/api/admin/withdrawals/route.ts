// app/api/admin/withdrawals/route.ts
// Admin withdrawal queue — view pending/processed requests. Staff
// (moderator+) can view; approve/reject requires admin (money-moving
// action, not routine support work).

import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { getConfiguredPayoutMethod } from "@/src/services/withdrawals"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const status = req.nextUrl.searchParams.get("status") ?? "pending"

  const [withdrawalsResult, payoutMethod] = await Promise.all([
    d1Query(
      `SELECT w.*, u.full_name, u.email, u.phone FROM withdrawals w
       JOIN users u ON u.id = w.user_id
       WHERE w.status = ? ORDER BY w.created_at DESC`,
      [status],
    ),
    getConfiguredPayoutMethod(),
  ])

  return NextResponse.json({ withdrawals: withdrawalsResult.results ?? [], payoutMethod })
}
