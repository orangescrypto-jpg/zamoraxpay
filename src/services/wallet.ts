// src/services/wallet.ts
// Service abstraction layer — wallet ledger.
//
// All wallet balance changes go through here. Routes and components
// never write to the `wallets` or `wallet_transactions` tables
// directly — this keeps balance math and idempotency checks in one
// place instead of scattered across every route that happens to touch
// money.
//
// CONCURRENCY MODEL (why this file looks the way it does)
// D1 has no cross-statement transactions (see lib/d1.ts), so we cannot
// do read → check → write safely: two simultaneous requests can both
// read the same balance and both pass the check. Instead:
//
//   1. IDEMPOTENCY IS CLAIMED FIRST. We INSERT the ledger row before
//      touching the balance. wallet_transactions.reference is UNIQUE,
//      so if two requests carry the same reference, exactly one INSERT
//      wins and the loser is rejected by the database itself — before
//      any money has moved. (The old code did SELECT-then-INSERT, which
//      has a race window between the two statements.)
//
//   2. THE BALANCE CHANGE IS A SINGLE ATOMIC STATEMENT. Debits use
//      `SET balance_kobo = balance_kobo - ? WHERE balance_kobo >= ?`,
//      so the "do you have enough" check and the subtraction happen
//      inside one statement. Credits use `balance_kobo = balance_kobo + ?`
//      so two concurrent credits can never overwrite each other.
//
//   3. IF THE DEBIT IS REJECTED, WE UNDO THE CLAIM. The ledger row is
//      deleted, because withdrawals.ts computes eligible balance by
//      summing wallet_transactions — a leftover row for a debit that
//      never happened would corrupt that math.
//
// We deliberately do NOT rely on D1's `meta.changes` to detect whether
// the guarded UPDATE applied: the native Workers binding path in
// lib/d1.ts does not return `meta`. Instead the UPDATE uses
// `RETURNING balance_kobo` — a row comes back only if THAT statement
// modified the wallet. (Comparing balances before/after does NOT work:
// it is shared state, so under concurrency every caller believes the
// balance drop was its own. This was verified by simulation.)
//
// Public API (exports and signatures) is unchanged, so no caller needs
// to be edited.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { WalletTransactionType } from "@/src/types"

export async function getWalletBalance(userId: string, nativeDB?: any): Promise<number> {
  const result = await d1Query("SELECT balance_kobo FROM wallets WHERE user_id = ?", [userId], nativeDB)
  return result.results?.[0]?.balance_kobo ?? 0
}

export async function ensureWalletExists(userId: string, nativeDB?: any): Promise<void> {
  // INSERT OR IGNORE — wallets.user_id is UNIQUE, so if two requests
  // race to create the same wallet, one inserts and the other is a
  // harmless no-op instead of throwing a constraint error.
  await d1Query(
    "INSERT OR IGNORE INTO wallets (id, user_id, balance_kobo) VALUES (?, ?, 0)",
    [randomUUID(), userId],
    nativeDB,
  )
}

/**
 * Checks whether a given idempotency reference (e.g. a payment webhook
 * event ID) has already been recorded as a wallet transaction.
 *
 * NOTE: This is a convenience read only. It is NOT what protects
 * against double-processing — creditWallet/debitWallet rely on the
 * UNIQUE(reference) constraint at INSERT time, which is race-free.
 * References of rows removed by data retention are also blocked at INSERT
 * time by trigger trg_block_archived_wallet_reference
 * (migrations/retention_fixes.sql), which raises a UNIQUE-style error.
 * Callers may still use this for early-exit / reporting purposes.
 */
export async function referenceAlreadyProcessed(reference: string, nativeDB?: any): Promise<boolean> {
  const result = await d1Query(
    `SELECT 1 AS hit FROM wallet_transactions WHERE reference = ?
     UNION ALL
     SELECT 1 AS hit FROM archived_wallet_references WHERE reference = ?
     LIMIT 1`,
    [reference, reference],
    nativeDB,
  )
  return (result.results?.length ?? 0) > 0
}

/** True when an error is a UNIQUE-constraint violation (duplicate reference). */
function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  return /unique|constraint/i.test(msg)
}

// Placeholder written to balance_after_kobo at claim time, corrected to
// the real post-change balance once the atomic UPDATE has run. The
// column is NOT NULL, so it needs a value at INSERT.
const BALANCE_AFTER_PLACEHOLDER = 0

export async function creditWallet(
  params: {
    userId: string
    amountKobo: number
    type: WalletTransactionType
    reference: string
    providerReference?: string
    relatedOrderId?: string
    metadata?: Record<string, unknown>
  },
  nativeDB?: any,
): Promise<{ newBalanceKobo: number }> {
  if (!Number.isInteger(params.amountKobo) || params.amountKobo <= 0) {
    throw new Error(`creditWallet: amountKobo must be a positive integer (got ${params.amountKobo})`)
  }

  await ensureWalletExists(params.userId, nativeDB)

  // STEP 1 — claim the reference. The UNIQUE(reference) constraint is
  // the idempotency gate: a duplicate webhook / double-tap / retry
  // fails HERE, before the balance is touched.
  const txId = randomUUID()
  try {
    await d1Query(
      `INSERT INTO wallet_transactions
        (id, user_id, type, direction, amount_kobo, balance_after_kobo, reference, provider_reference, related_order_id, status, metadata)
       VALUES (?, ?, ?, 'credit', ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        txId,
        params.userId,
        params.type,
        params.amountKobo,
        BALANCE_AFTER_PLACEHOLDER,
        params.reference,
        params.providerReference ?? null,
        params.relatedOrderId ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
      nativeDB,
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Already processed — idempotent no-op. Return the current
      // balance without crediting a second time.
      const balance = await getWalletBalance(params.userId, nativeDB)
      return { newBalanceKobo: balance }
    }
    throw err
  }

  // STEP 2 — atomic increment. Never "read, add, write back": that
  // pattern silently loses a credit when two run at once.
  let creditResult
  try {
    creditResult = await d1Query(
      "UPDATE wallets SET balance_kobo = balance_kobo + ?, updated_at = datetime('now') WHERE user_id = ? RETURNING balance_kobo",
      [params.amountKobo, params.userId],
      nativeDB,
    )
  } catch (err) {
    // The ledger row was claimed but the balance change failed to
    // apply. Remove the claim so a retry with the SAME reference can
    // succeed instead of being wrongly treated as "already processed"
    // (which would leave the customer paid-for but never credited).
    await d1Query("DELETE FROM wallet_transactions WHERE id = ?", [txId], nativeDB).catch((cleanupErr) =>
      console.error("[wallet] Failed to release claim after credit failure:", params.reference, cleanupErr),
    )
    throw err
  }

  const newBalance = (creditResult?.results?.[0]?.balance_kobo as number | undefined) ?? (await getWalletBalance(params.userId, nativeDB))

  // STEP 3 — correct the ledger row's balance_after to the real value.
  // Best-effort: the money is already correct, this only fixes the
  // display column, so a failure here must not fail the credit.
  await d1Query("UPDATE wallet_transactions SET balance_after_kobo = ? WHERE id = ?", [newBalance, txId], nativeDB).catch(
    (err) => console.error("[wallet] Failed to set balance_after on credit:", params.reference, err),
  )

  return { newBalanceKobo: newBalance }
}

export async function debitWallet(
  params: {
    userId: string
    amountKobo: number
    type: WalletTransactionType
    reference: string
    relatedOrderId?: string
    metadata?: Record<string, unknown>
  },
  nativeDB?: any,
): Promise<{ success: boolean; newBalanceKobo: number; message?: string }> {
  if (!Number.isInteger(params.amountKobo) || params.amountKobo <= 0) {
    throw new Error(`debitWallet: amountKobo must be a positive integer (got ${params.amountKobo})`)
  }

  await ensureWalletExists(params.userId, nativeDB)

  // STEP 1 — claim the reference (idempotency gate, see credit above).
  const txId = randomUUID()
  try {
    await d1Query(
      `INSERT INTO wallet_transactions
        (id, user_id, type, direction, amount_kobo, balance_after_kobo, reference, related_order_id, status, metadata)
       VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, 'completed', ?)`,
      [
        txId,
        params.userId,
        params.type,
        params.amountKobo,
        BALANCE_AFTER_PLACEHOLDER,
        params.reference,
        params.relatedOrderId ?? null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
      nativeDB,
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      // This exact debit was already applied by an earlier attempt.
      // Report success WITHOUT debiting again — same behaviour as the
      // old code, but now race-free.
      const balance = await getWalletBalance(params.userId, nativeDB)
      return { success: true, newBalanceKobo: balance }
    }
    throw err
  }

  // STEP 2 — guarded atomic decrement WITH `RETURNING`.
  //
  // The `balance_kobo >= ?` guard is evaluated inside the same
  // statement as the subtraction, so two simultaneous debits cannot
  // both spend the same money: once the first applies, the second's
  // WHERE clause no longer matches.
  //
  // `RETURNING balance_kobo` is what tells THIS caller whether ITS OWN
  // statement applied: a row comes back only if this statement
  // modified the wallet; zero rows means the guard rejected it. This
  // is a per-statement signal, unlike comparing balances before/after
  // (shared state — with concurrent debits every caller sees "the
  // balance dropped by my amount" and wrongly concludes it was theirs;
  // that approach was tried and failed under a concurrency simulation).
  // Same pattern already used in rewardsClaim.ts, and it works on both
  // the HTTP and native-binding paths in lib/d1.ts (no `meta` needed).
  let updated
  try {
    updated = await d1Query(
      `UPDATE wallets
          SET balance_kobo = balance_kobo - ?, updated_at = datetime('now')
        WHERE user_id = ? AND balance_kobo >= ?
        RETURNING balance_kobo`,
      [params.amountKobo, params.userId, params.amountKobo],
      nativeDB,
    )
  } catch (err) {
    // Could not even run the statement — release the claim so the
    // ledger doesn't record a debit that never happened, then surface
    // the error (callers already treat a throw as a failed purchase).
    await d1Query("DELETE FROM wallet_transactions WHERE id = ?", [txId], nativeDB).catch((cleanupErr) =>
      console.error("[wallet] Failed to release claim after debit failure:", params.reference, cleanupErr),
    )
    throw err
  }

  const returned = updated.results ?? []

  if (returned.length === 0) {
    // Guard rejected the debit (insufficient funds). Undo the claim so
    // withdrawals.ts (which sums wallet_transactions) never counts a
    // debit that didn't happen.
    await d1Query("DELETE FROM wallet_transactions WHERE id = ?", [txId], nativeDB).catch((cleanupErr) =>
      console.error("[wallet] Failed to release claim after rejected debit:", params.reference, cleanupErr),
    )
    const balance = await getWalletBalance(params.userId, nativeDB)
    return { success: false, newBalanceKobo: balance, message: "Insufficient wallet balance" }
  }

  // The returned balance is the exact post-debit value produced by OUR
  // statement — not a re-read that another request could have moved.
  const newBalance = returned[0].balance_kobo as number

  await d1Query("UPDATE wallet_transactions SET balance_after_kobo = ? WHERE id = ?", [newBalance, txId], nativeDB).catch(
    (err) => console.error("[wallet] Failed to set balance_after on debit:", params.reference, err),
  )

  return { success: true, newBalanceKobo: newBalance }
}

/** Reverses a previous debit (e.g. all VTU providers failed for an order, or a withdrawal was rejected). */
export async function refundWallet(
  params: { userId: string; amountKobo: number; reference: string; relatedOrderId?: string },
  nativeDB?: any,
): Promise<{ newBalanceKobo: number }> {
  // Nothing to give back (e.g. a voucher-funded order that charged ₦0): report the
  // current balance instead of letting creditWallet reject a zero amount and leave
  // the reconcile/orphan refund paths stuck retrying forever.
  if (!Number.isInteger(params.amountKobo) || params.amountKobo <= 0) {
    return { newBalanceKobo: await getWalletBalance(params.userId, nativeDB) }
  }
  return creditWallet(
    {
      userId: params.userId,
      amountKobo: params.amountKobo,
      type: "refund",
      reference: params.reference,
      relatedOrderId: params.relatedOrderId,
    },
    nativeDB,
  )
}
