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
  // This DOESN'T use a hardcoded table list. The repo's schema.sql and
  // what's actually deployed on this D1 database have drifted apart
  // (funding_sources and vtu_orders_archive don't exist here; some
  // other table DOES have a live foreign key to users that isn't in
  // schema.sql at all — that's what the FOREIGN KEY constraint error
  // was). A hardcoded list can't keep up with that drift, so instead:
  // ask D1's own schema (PRAGMA foreign_key_list) which tables
  // reference users — directly, or transitively through another table
  // that references users — and build the DELETE statements from
  // that, so coverage always matches what D1 actually enforces.
  const existingTablesResult = await d1Query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  const existingTables = (existingTablesResult.results ?? []).map((r: any) => r.name as string)

  type FkEdge = { table: string; column: string; refTable: string }
  const fkEdges: FkEdge[] = []
  for (const table of existingTables) {
    const fkResult = await d1Query(`PRAGMA foreign_key_list(${table})`)
    for (const fk of (fkResult.results ?? []) as any[]) {
      fkEdges.push({ table, column: fk.from, refTable: fk.table })
    }
  }

  // For a table, build a DELETE condition that reaches back to the
  // user via however many hops of foreign keys it takes (e.g.
  // bulk_purchase_items -> bulk_purchase_runs -> users). Returns null
  // if this table has no path back to users at all.
  function buildCondition(table: string, visiting: Set<string> = new Set()): string | null {
    if (table === "users") return "id = ?"
    if (visiting.has(table)) return null // guard against FK cycles
    visiting.add(table)
    for (const edge of fkEdges.filter((e) => e.table === table)) {
      const parentCondition = buildCondition(edge.refTable, visiting)
      if (parentCondition) {
        return `${edge.column} IN (SELECT id FROM ${edge.refTable} WHERE ${parentCondition})`
      }
    }
    return null
  }

  const statements: { sql: string; params: unknown[] }[] = []
  for (const table of existingTables) {
    if (table === "users" || table === "admin_audit_log") continue // audit log is the deletion record itself — never erase it
    const condition = buildCondition(table)
    if (condition) statements.push({ sql: `DELETE FROM ${table} WHERE ${condition}`, params: [id] })
  }

  // Defer FK checks to the end of this transaction/batch instead of
  // per-statement — belt-and-braces against ordering issues between
  // the statements above (it does NOT paper over missing coverage;
  // buildCondition above is what guarantees every referencing table
  // is included).
  statements.unshift({ sql: "PRAGMA defer_foreign_keys = ON", params: [] })

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
