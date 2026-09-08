// app/api/db/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  if (auth.uid !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await d1Query("SELECT * FROM users WHERE id = ?", [id])
  const row = result.results?.[0]
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Email verification truth lives in Supabase, not D1 — D1 only mirrors
  // profile fields. Whether this is populated depends entirely on the
  // "Confirm email" setting in the Supabase dashboard.
  let emailConfirmed = false
  try {
    const supabase = createServiceRoleClient()
    const { data } = await supabase.auth.admin.getUserById(id)
    emailConfirmed = !!data.user?.email_confirmed_at
  } catch {
    // If this lookup fails for any reason, default to false rather than
    // block the whole profile response.
  }

  // Admin status lives in a separate table — most users won't have a
  // row here at all, which is the expected (non-admin) case.
  let adminRole: string | null = null
  try {
    const adminResult = await d1Query("SELECT role FROM admin_users WHERE id = ? LIMIT 1", [id])
    adminRole = adminResult.results?.[0]?.role ?? null
  } catch {
    // Same defensive default as emailConfirmed above — a lookup failure
    // here should never block the whole profile response.
  }

  return NextResponse.json({
    id: row.id,
    phone: row.phone,
    email: row.email,
    fullName: row.full_name,
    emailConfirmed,
    hasTransactionPin: !!row.transaction_pin_hash,
    tier: row.tier,
    status: row.status,
    referralCode: row.referral_code,
    createdAt: row.created_at,
    adminRole,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  if (auth.uid !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const updates = await req.json()
    const sets: string[] = []
    const values: unknown[] = []

    if (updates.fullName !== undefined) {
      sets.push("full_name = ?")
      values.push(updates.fullName)
    }
    if (updates.email !== undefined) {
      sets.push("email = ?")
      values.push(updates.email)
    }
    if (updates.phone !== undefined) {
      sets.push("phone = ?")
      values.push(updates.phone)
    }

    if (sets.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

    sets.push("updated_at = datetime('now')")
    values.push(id)

    await d1Query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, values)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
