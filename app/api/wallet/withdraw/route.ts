// app/api/wallet/withdraw/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { requestWithdrawal, getWithdrawableBalance } from "@/src/services/withdrawals"
import { isFeatureEnabled } from "@/src/services/config"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const [withdrawableBalance, history] = await Promise.all([
    getWithdrawableBalance(auth.uid),
    d1Query("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [auth.uid]),
  ])

  return NextResponse.json({
    withdrawableBalanceKobo: withdrawableBalance,
    withdrawals: history.results ?? [],
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  // This is the actual guardrail — /api/withdrawal-status only controls
  // what the UI shows. Without this check, a user could still POST here
  // directly while admin has the feature switched off.
  if (!(await isFeatureEnabled("withdrawal"))) {
    return NextResponse.json({ error: "Withdrawals are currently unavailable" }, { status: 403 })
  }

  try {
    const { amountKobo, bankName, accountNumber, accountName, bankCode } = await req.json()

    if (!amountKobo || !bankName || !accountNumber || !accountName) {
      return NextResponse.json({ error: "amountKobo, bankName, accountNumber, and accountName are required" }, { status: 400 })
    }

    const result = await requestWithdrawal({
      userId: auth.uid,
      amountKobo,
      bankName,
      accountNumber,
      accountName,
      bankCode,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Withdrawal request failed" }, { status: 500 })
  }
}

