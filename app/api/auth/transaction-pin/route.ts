// app/api/auth/transaction-pin/route.ts
// Sets (or replaces) the user's 4-digit transaction PIN, hashed with
// bcrypt-style scrypt (Node's built-in crypto — no extra dependency).

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { hashPin } from "@/src/services/pin"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { pin } = await req.json()
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 })
    }

    const pinHash = hashPin(pin)
    await d1Query("UPDATE users SET transaction_pin_hash = ?, updated_at = datetime('now') WHERE id = ?", [
      pinHash,
      auth.uid,
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to set PIN" }, { status: 500 })
  }
}
