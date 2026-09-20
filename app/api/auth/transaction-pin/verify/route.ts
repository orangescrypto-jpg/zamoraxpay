// app/api/auth/transaction-pin/verify/route.ts
// Checks a PIN and returns {valid}. This is a direct brute-force oracle
// (send a guess, learn yes/no), so it goes through the rate limiter:
// 5 wrong attempts locks the PIN for 30 minutes across ALL PIN checks.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { checkPinWithLimit } from "@/src/services/pinGuard"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { pin } = await req.json()
    if (!pin) return NextResponse.json({ error: "PIN is required" }, { status: 400 })

    const result = await d1Query("SELECT transaction_pin_hash FROM users WHERE id = ?", [auth.uid])
    const storedHash = result.results?.[0]?.transaction_pin_hash

    if (!storedHash) {
      return NextResponse.json({ error: "No transaction PIN set for this account" }, { status: 400 })
    }

    const check = await checkPinWithLimit(auth.uid, String(pin), storedHash)

    // 429 when locked so clients can distinguish "wrong PIN" from "stop".
    return NextResponse.json(
      { valid: check.valid, locked: check.locked, attemptsRemaining: check.attemptsRemaining, message: check.message },
      { status: check.locked ? 429 : 200 },
    )
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "PIN verification failed" }, { status: 500 })
  }
}
