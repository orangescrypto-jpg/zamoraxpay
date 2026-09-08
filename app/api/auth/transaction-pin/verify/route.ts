// app/api/auth/transaction-pin/verify/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { verifyPin } from "@/src/services/pin"

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

    const valid = verifyPin(pin, storedHash)
    return NextResponse.json({ valid })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "PIN verification failed" }, { status: 500 })
  }
}
