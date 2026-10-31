// src/services/pendingWalletFundings.ts
// Tracks wallet-funding attempts from initialization through
// resolution, independent of the Korapay webhook and independent of
// the user ever returning to /wallet?funding=complete.
//
// Why this exists: a user can initialize a funding payment, pay via
// Korapay's bank-transfer checkout, and then close that tab (or just
// never come back to it) before Korapay redirects back. When that
// happens, the client-side verify-on-return flow in
// app/(dashboard)/wallet/page.tsx never runs — there's no redirect to
// trigger it. The ONLY thing that can credit that wallet is then the
// webhook. If the webhook is ever delayed, dropped, or misconfigured,
// the user is left paid-but-uncredited with no way to self-recover,
// since nothing else ever re-checks that specific payment again.
//
// This table + the /api/wallet/fund/reconcile route close that gap: a
// plain, parameter-less /wallet page load can look up the signed-in
// user's own unresolved funding references and actively re-verify
// each one, the same way the funding=complete redirect flow already
// does — just without requiring that redirect to have happened at all.

import { d1Query } from "@/lib/db"

export interface PendingWalletFunding {
  reference: string
  userId: string
  provider: string
  amountKobo: number
  createdAt: string
}

const RECONCILE_MAX_AGE_HOURS = 48 // don't bother re-checking ancient abandoned attempts forever

export async function listPendingWalletFundings(userId: string, nativeDB?: any): Promise<PendingWalletFunding[]> {
  const result = await d1Query(
    `SELECT reference, user_id, provider, amount_kobo, created_at
       FROM pending_wallet_fundings
      WHERE user_id = ?
        AND status = 'pending'
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT 10`,
    [userId, `-${RECONCILE_MAX_AGE_HOURS} hours`],
    nativeDB,
  )
  return (result.results ?? []).map((row: any) => ({
    reference: row.reference,
    userId: row.user_id,
    provider: row.provider,
    amountKobo: row.amount_kobo,
    createdAt: row.created_at,
  }))
}

// Marks a reference resolved so it stops showing up in the
// reconciliation check above. Safe to call for a reference that was
// never recorded (e.g. pre-migration payments, or the insert in
// fund/route.ts failed) — affects 0 rows, no error.
export async function resolvePendingWalletFunding(reference: string, nativeDB?: any): Promise<void> {
  await d1Query(
    `UPDATE pending_wallet_fundings SET status = 'resolved', resolved_at = datetime('now') WHERE reference = ?`,
    [reference],
    nativeDB,
  )
}
