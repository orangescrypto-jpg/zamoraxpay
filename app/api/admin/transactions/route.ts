// app/api/admin/transactions/route.ts
// Reconciliation view: VTU orders and wallet transactions in one place
// so staff can spot a webhook that silently failed to credit, or an
// order stuck in "pending". Open to any staff role — this is a
// read-only view useful for support/moderation, not just admins.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const type = req.nextUrl.searchParams.get("type") ?? "orders" // 'orders' | 'wallet'
  const status = req.nextUrl.searchParams.get("status")
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100")

  if (type === "wallet") {
    const sql = status
      ? "SELECT * FROM wallet_transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT ?"
    const params = status ? [status, limit] : [limit]
    const result = await d1Query(sql, params)
    return NextResponse.json({ transactions: result.results ?? [] })
  }

  const sql = status
    ? "SELECT * FROM vtu_orders WHERE status = ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM vtu_orders ORDER BY created_at DESC LIMIT ?"
  const params = status ? [status, limit] : [limit]
  const result = await d1Query(sql, params)
  return NextResponse.json({ orders: result.results ?? [] })
}
