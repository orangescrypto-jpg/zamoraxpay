// app/api/wallet/balance/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getWalletBalance } from "@/src/services/wallet"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const balanceKobo = await getWalletBalance(auth.uid)

  const walletResult = await d1Query("SELECT cashback_kobo FROM wallets WHERE user_id = ?", [auth.uid])
  const cashbackKobo = walletResult.results?.[0]?.cashback_kobo ?? 0

  return NextResponse.json({ balanceKobo, cashbackKobo })
}
