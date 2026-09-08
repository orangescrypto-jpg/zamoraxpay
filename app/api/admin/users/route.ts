// app/api/admin/users/route.ts
// Customer management: search/list users, suspend/reactivate accounts.
// Open to any staff role (moderator, admin, super_admin) — this is
// routine day-to-day support work. Permanent deletion is a SEPARATE
// route (/api/admin/users/[id] DELETE) locked to super_admin only.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const search = req.nextUrl.searchParams.get("search")
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50")

  const sql = search
    ? `SELECT u.*, w.balance_kobo FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.phone LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?
       ORDER BY u.created_at DESC LIMIT ?`
    : `SELECT u.*, w.balance_kobo FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY u.created_at DESC LIMIT ?`

  const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`, limit] : [limit]
  const result = await d1Query(sql, params)

  const users = (result.results ?? []).map((r: any) => ({
    id: r.id,
    phone: r.phone,
    email: r.email,
    fullName: r.full_name,
    tier: r.tier,
    status: r.status,
    balanceKobo: r.balance_kobo ?? 0,
    createdAt: r.created_at,
  }))

  return NextResponse.json({ users })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  try {
    const { userId, status } = await req.json()
    if (!userId || !status) return NextResponse.json({ error: "userId and status are required" }, { status: 400 })
    if (!["active", "suspended", "frozen"].includes(status)) {
      return NextResponse.json({ error: "status must be active, suspended, or frozen" }, { status: 400 })
    }

    const before = await d1Query("SELECT status FROM users WHERE id = ?", [userId])
    await d1Query("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, userId])

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'user.status_change', 'users', ?, ?, ?)`,
      [randomUUID(), auth.uid, userId, JSON.stringify(before.results?.[0]), JSON.stringify({ status })],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
