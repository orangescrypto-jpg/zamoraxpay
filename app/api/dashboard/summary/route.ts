import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getWalletBalance } from "@/src/services/wallet"
import { getOrderHistory, getWalletTransactionHistory } from "@/src/services/vtuOrders"
import { getStreakStatus } from "@/src/services/dailyStreak"

// One authenticated dashboard read replaces three separate API requests.
// The underlying D1 reads still run in parallel, but the browser only
// creates one Worker/function invocation for the dashboard summary.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [balanceKobo, walletResult, orders, walletTransactions, streak] = await Promise.all([
    getWalletBalance(auth.uid),
    d1Query("SELECT cashback_kobo FROM wallets WHERE user_id = ?", [auth.uid]),
    getOrderHistory(auth.uid),
    getWalletTransactionHistory(auth.uid),
    getStreakStatus(auth.uid),
  ])

  return NextResponse.json({
    balanceKobo,
    cashbackKobo: walletResult.results?.[0]?.cashback_kobo ?? 0,
    orders,
    walletTransactions,
    streak,
  })
}
