// app/api/admin/staff/route.ts
// Manage who has admin-panel access at all. Only super_admin can add,
// change role, or remove a staff member — this is the "who can grant
// power" boundary, so it must sit above the roles it grants.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff, requireSuperAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { randomUUID } from "crypto"

const VALID_ROLES = ["moderator", "admin", "super_admin"]

export async function GET(req: NextRequest) {
  // Any staff member can see who else has access — useful context,
  // not a sensitive action by itself.
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM admin_users ORDER BY created_at DESC")
  return NextResponse.json({ staff: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { userId, email, role } = await req.json()
    if (!userId || !email || !role) {
      return NextResponse.json({ error: "userId, email, and role are required" }, { status: 400 })
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 })
    }

    await d1Query("INSERT INTO admin_users (id, email, role) VALUES (?, ?, ?)", [userId, email, role])

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, after_json)
       VALUES (?, ?, 'staff.add', 'admin_users', ?, ?)`,
      [randomUUID(), auth.uid, userId, JSON.stringify({ email, role })],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add staff member" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { userId, role } = await req.json()
    if (!userId || !role) return NextResponse.json({ error: "userId and role are required" }, { status: 400 })
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 })
    }

    const before = await d1Query("SELECT role FROM admin_users WHERE id = ?", [userId])
    await d1Query("UPDATE admin_users SET role = ? WHERE id = ?", [role, userId])

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'staff.role_change', 'admin_users', ?, ?, ?)`,
      [randomUUID(), auth.uid, userId, JSON.stringify(before.results?.[0]), JSON.stringify({ role })],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId query param is required" }, { status: 400 })

  if (userId === auth.uid) {
    return NextResponse.json({ error: "You cannot remove your own staff access" }, { status: 400 })
  }

  const before = await d1Query("SELECT * FROM admin_users WHERE id = ?", [userId])
  await d1Query("DELETE FROM admin_users WHERE id = ?", [userId])

  await d1Query(
    `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json)
     VALUES (?, ?, 'staff.remove', 'admin_users', ?, ?)`,
    [randomUUID(), auth.uid, userId, JSON.stringify(before.results?.[0])],
  )

  return NextResponse.json({ success: true })
}
