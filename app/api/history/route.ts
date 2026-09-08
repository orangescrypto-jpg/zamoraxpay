// app/api/history/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getOrderHistory, getWalletTransactionHistory } from "@/src/services/vtuOrders"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [orders, walletTransactions] = await Promise.all([
    getOrderHistory(auth.uid),
    getWalletTransactionHistory(auth.uid),
  ])

  return NextResponse.json({ orders, walletTransactions })
}
