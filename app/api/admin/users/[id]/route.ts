// app/api/admin/users/[id]/route.ts
// Full-detail admin view of one user (everything: contact info,
// wallet, tier, BVN verification status, order history, wallet
// ledger) — and permanent deletion.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff, requireSuperAdmin } from "@/lib/auth-server"
import { d1Query, d1Batch } from "@/lib/db"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"
import { randomUUID } from "crypto"
import { withDisplayAmount } from "@/src/services/vtuOrders"

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
    recentOrders: (ordersResult.results ?? []).map(withDisplayAmount),
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

  // Hard delete: every row anywhere in D1 that references this user,
  // then the user row itself — run as ONE atomic D1 batch so this is
  // all-or-nothing. Nothing is archived; this is a permanent removal.
  //
  // This list was built directly from the live schema (via
  // `SELECT name, sql FROM sqlite_master WHERE sql LIKE '%REFERENCES
  // users%'` run against the actual deployed D1 database on 2026-11-01
  // — NOT from the repo's schema.sql, which has drifted from what's
  // really deployed: funding_sources and vtu_orders_archive don't
  // exist here, and pin_attempts / weekend_bonus_payouts /
  // cashback_awards / pending_wallet_fundings DO exist here but aren't
  // in schema.sql at all). No PRAGMA calls are used — D1's HTTP/console
  // path rejects PRAGMA foreign_key_list as a joined table-valued
  // function (SQLITE_AUTH), and since we can't be certain the single-
  // table PRAGMA form the previous version of this route depended on
  // behaves differently there, this version doesn't touch PRAGMA at
  // all for discovery.
  //
  // If the schema changes again, re-run that sqlite_master query and
  // update this list — see the comment above it for the exact SQL.
  const existingTablesResult = await d1Query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  const existingTables = new Set((existingTablesResult.results ?? []).map((r: any) => r.name as string))

  const candidateStatements: { table: string; sql: string; params: unknown[] }[] = [
    // grandchildren — keyed off ids of rows that themselves belong to the user
    { table: "bulk_purchase_items", sql: "DELETE FROM bulk_purchase_items WHERE run_id IN (SELECT id FROM bulk_purchase_runs WHERE user_id = ?)", params: [id] },
    { table: "contact_batch_numbers", sql: "DELETE FROM contact_batch_numbers WHERE batch_id IN (SELECT id FROM contact_batches WHERE user_id = ?)", params: [id] },

    // direct children — every table confirmed via sqlite_master to have `REFERENCES users`
    { table: "wallets", sql: "DELETE FROM wallets WHERE user_id = ?", params: [id] },
    { table: "wallet_transactions", sql: "DELETE FROM wallet_transactions WHERE user_id = ?", params: [id] },
    { table: "funding_source_accounts", sql: "DELETE FROM funding_source_accounts WHERE user_id = ?", params: [id] },
    { table: "withdrawals", sql: "DELETE FROM withdrawals WHERE user_id = ?", params: [id] },
    { table: "vtu_orders", sql: "DELETE FROM vtu_orders WHERE user_id = ?", params: [id] },
    { table: "beneficiaries", sql: "DELETE FROM beneficiaries WHERE user_id = ?", params: [id] },
    { table: "auto_reload_rules", sql: "DELETE FROM auto_reload_rules WHERE user_id = ?", params: [id] },
    { table: "reseller_bvn_verifications", sql: "DELETE FROM reseller_bvn_verifications WHERE user_id = ?", params: [id] },
    { table: "referrals", sql: "DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?", params: [id, id] },
    { table: "cookie_consents", sql: "DELETE FROM cookie_consents WHERE user_id = ?", params: [id] },
    { table: "fraud_flags", sql: "DELETE FROM fraud_flags WHERE user_id = ?", params: [id] },
    { table: "weekend_bonus_payouts", sql: "DELETE FROM weekend_bonus_payouts WHERE user_id = ?", params: [id] },
    { table: "contact_batches", sql: "DELETE FROM contact_batches WHERE user_id = ?", params: [id] },
    { table: "bulk_purchase_runs", sql: "DELETE FROM bulk_purchase_runs WHERE user_id = ?", params: [id] },
    { table: "daily_streaks", sql: "DELETE FROM daily_streaks WHERE user_id = ?", params: [id] },
    { table: "daily_streak_checkins", sql: "DELETE FROM daily_streak_checkins WHERE user_id = ?", params: [id] },
    { table: "cashback_awards", sql: "DELETE FROM cashback_awards WHERE user_id = ?", params: [id] },
    { table: "international_topup_orders", sql: "DELETE FROM international_topup_orders WHERE user_id = ?", params: [id] },
    { table: "push_notification_log", sql: "DELETE FROM push_notification_log WHERE user_id = ?", params: [id] },
    { table: "push_subscriptions", sql: "DELETE FROM push_subscriptions WHERE user_id = ?", params: [id] },
    { table: "pin_attempts", sql: "DELETE FROM pin_attempts WHERE user_id = ?", params: [id] },
    { table: "spin_tickets", sql: "DELETE FROM spin_tickets WHERE user_id = ?", params: [id] },
    { table: "spin_spins", sql: "DELETE FROM spin_spins WHERE user_id = ?", params: [id] },
    { table: "spin_vouchers", sql: "DELETE FROM spin_vouchers WHERE user_id = ?", params: [id] },
    { table: "streak_protections", sql: "DELETE FROM streak_protections WHERE user_id = ?", params: [id] },
    { table: "pending_wallet_fundings", sql: "DELETE FROM pending_wallet_fundings WHERE user_id = ?", params: [id] },

    // self-referential: other users whose referred_by_user_id points at this one
    { table: "users", sql: "UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = ?", params: [id] },
  ]

  const statements = candidateStatements
    .filter((s) => existingTables.has(s.table))
    .map((s) => ({ sql: s.sql, params: s.params }))

  // the user row itself, last
  statements.push({ sql: "DELETE FROM users WHERE id = ?", params: [id] })

  try {
    await d1Batch(statements)
  } catch (err) {
    return NextResponse.json(
      { error: `Delete failed, nothing was removed: ${err instanceof Error ? err.message : "Unknown D1 error"}` },
      { status: 500 },
    )
  }

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
