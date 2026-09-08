// app/api/admin/fraud/route.ts
// Fraud/reversal dashboard: list flags, review/dismiss them, and freeze a
// user's wallet directly from a flag. Open to any staff role — this is
// routine support/moderation work.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireStaff } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const status = req.nextUrl.searchParams.get("status") ?? "open"
  const result = await d1Query(
    `SELECT f.*, u.full_name, u.phone FROM fraud_flags f
     JOIN users u ON u.id = f.user_id
     WHERE f.status = ? ORDER BY f.created_at DESC`,
    [status],
  )
  return NextResponse.json({ flags: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  // Allows the system (or an admin manually) to raise a fraud flag,
  // e.g. from a rapid-repeated-topup detector run elsewhere.
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  try {
    const { userId, relatedTransactionId, reason, notes } = await req.json()
    if (!userId || !reason) return NextResponse.json({ error: "userId and reason are required" }, { status: 400 })

    const id = randomUUID()
    await d1Query(
      `INSERT INTO fraud_flags (id, user_id, related_transaction_id, reason, notes) VALUES (?, ?, ?, ?, ?)`,
      [id, userId, relatedTransactionId ?? null, reason, notes ?? null],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create flag" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  try {
    const { flagId, status, notes, freezeWallet } = await req.json()
    if (!flagId || !status) return NextResponse.json({ error: "flagId and status are required" }, { status: 400 })

    await d1Query(
      `UPDATE fraud_flags SET status = ?, notes = COALESCE(?, notes), reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`,
      [status, notes ?? null, auth.uid, flagId],
    )

    if (freezeWallet) {
      const flagResult = await d1Query("SELECT user_id FROM fraud_flags WHERE id = ?", [flagId])
      const userId = flagResult.results?.[0]?.user_id
      if (userId) {
        await d1Query("UPDATE users SET status = 'frozen', updated_at = datetime('now') WHERE id = ?", [userId])
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
