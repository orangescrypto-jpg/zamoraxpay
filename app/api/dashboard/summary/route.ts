import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getOrderHistory, getWalletTransactionHistory } from "@/src/services/vtuOrders"
import { getStreakStatus } from "@/src/services/dailyStreak"

// One authenticated dashboard read replaces three separate API requests.
// The underlying D1 reads still run in parallel, but the browser only
// creates one Worker/function invocation for the dashboard summary.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [walletResult, orders, walletTransactions, streak] = await Promise.all([
    // Balance and cashback live on the same row; one read is enough.
    d1Query("SELECT balance_kobo, cashback_kobo FROM wallets WHERE user_id = ?", [auth.uid]),
    // The dashboard renders only the five newest feed items. Five from each
    // source is sufficient to compute the newest five after merging, while
    // keeping the full history endpoint unchanged.
    getOrderHistory(auth.uid, 5),
    getWalletTransactionHistory(auth.uid, 5),
    getStreakStatus(auth.uid),
  ])

  const wallet = walletResult.results?.[0] as { balance_kobo?: number; cashback_kobo?: number } | undefined

  return NextResponse.json({
    balanceKobo: Number(wallet?.balance_kobo ?? 0),
    cashbackKobo: Number(wallet?.cashback_kobo ?? 0),
    orders,
    walletTransactions,
    streak,
  })
}
