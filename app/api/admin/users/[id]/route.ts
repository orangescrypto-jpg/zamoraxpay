// app/api/admin/users/[id]/route.ts
// Full-detail admin view of one user (everything: contact info,
// wallet, tier, BVN verification status, order history, wallet
// ledger) — and permanent deletion.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff, requireSuperAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params

  const [userResult, walletResult, bvnResult, ordersResult, walletTxResult, fraudResult] = await Promise.all([
    d1Query("SELECT * FROM users WHERE id = ?", [id]),
    d1Query("SELECT * FROM wallets WHERE user_id = ?", [id]),
    d1Query("SELECT * FROM reseller_bvn_verifications WHERE user_id = ?", [id]),
    d1Query("SELECT * FROM vtu_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", [id]),
    d1Query("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", [id]),
    d1Query("SELECT * FROM fraud_flags WHERE user_id = ? ORDER BY created_at DESC", [id]),
  ])

  const user = userResult.results?.[0]
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Pull Supabase's own record too — email_confirmed_at, last_sign_in_at,
  // and provider info live there, not in D1.
  let supabaseUser = null
  try {
    const supabase = createServiceRoleClient()
    const { data } = await supabase.auth.admin.getUserById(id)
    supabaseUser = data.user
      ? {
          emailConfirmedAt: data.user.email_confirmed_at ?? null,
          lastSignInAt: data.user.last_sign_in_at ?? null,
          createdAt: data.user.created_at,
        }
      : null
  } catch {
    // Non-fatal — D1 data is still returned even if this lookup fails
  }

  return NextResponse.json({
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.full_name,
      tier: user.tier,
      status: user.status,
      referralCode: user.referral_code,
      referredByUserId: user.referred_by_user_id,
      hasTransactionPin: !!user.transaction_pin_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    supabase: supabaseUser,
    wallet: walletResult.results?.[0] ?? null,
    bvnVerification: bvnResult.results?.[0] ?? null,
    recentOrders: ordersResult.results ?? [],
    recentWalletTransactions: walletTxResult.results ?? [],
    fraudFlags: fraudResult.results ?? [],
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Permanent deletion is destructive and irreversible — require
  // super_admin, not just admin.
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params

  const userResult = await d1Query("SELECT * FROM users WHERE id = ?", [id])
  const user = userResult.results?.[0]
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Log before deleting — this is the one record of the deletion that
  // survives it.
  await d1Query(
    `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json)
     VALUES (?, ?, 'user.permanent_delete', 'users', ?, ?)`,
    [randomUUID(), auth.uid, id, JSON.stringify(user)],
  )

  // Delete dependent rows first (D1/SQLite foreign keys aren't
  // enforced by default, but doing this explicitly keeps the data
  // model honest regardless of that setting).
  await Promise.all([
    d1Query("DELETE FROM wallet_transactions WHERE user_id = ?", [id]),
    d1Query("DELETE FROM vtu_orders WHERE user_id = ?", [id]),
    d1Query("DELETE FROM beneficiaries WHERE user_id = ?", [id]),
    d1Query("DELETE FROM auto_reload_rules WHERE user_id = ?", [id]),
    d1Query("DELETE FROM reseller_bvn_verifications WHERE user_id = ?", [id]),
    d1Query("DELETE FROM fraud_flags WHERE user_id = ?", [id]),
    d1Query("DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?", [id, id]),
    d1Query("DELETE FROM wallets WHERE user_id = ?", [id]),
  ])

  await d1Query("DELETE FROM users WHERE id = ?", [id])

  // Also remove the Supabase auth account — otherwise the person could
  // still "exist" as a login even though their ZamoraxPay profile is
  // gone.
  try {
    const supabase = createServiceRoleClient()
    await supabase.auth.admin.deleteUser(id)
  } catch (err) {
    // The D1 side is already deleted at this point; surface the
    // Supabase failure but don't roll back — a stranded auth record
    // with no profile is a much smaller problem than a stuck delete.
    return NextResponse.json({
      success: true,
      warning: `User data deleted, but Supabase auth account removal failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    })
  }

  return NextResponse.json({ success: true })
}
