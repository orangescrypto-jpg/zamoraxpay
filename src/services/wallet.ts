// src/services/wallet.ts
// Service abstraction layer — wallet ledger.
//
// All wallet balance changes go through here. Routes and components
// never write to the `wallets` or `wallet_transactions` tables
// directly — this keeps balance math and idempotency checks in one
// place instead of scattered across every route that happens to touch
// money.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { WalletTransactionType } from "@/src/types"

export async function getWalletBalance(userId: string, nativeDB?: any): Promise<number> {
  const result = await d1Query("SELECT balance_kobo FROM wallets WHERE user_id = ?", [userId], nativeDB)
  return result.results?.[0]?.balance_kobo ?? 0
}

export async function ensureWalletExists(userId: string, nativeDB?: any): Promise<void> {
  const existing = await d1Query("SELECT id FROM wallets WHERE user_id = ?", [userId], nativeDB)
  if (existing.results?.length) return

  await d1Query(
    "INSERT INTO wallets (id, user_id, balance_kobo) VALUES (?, ?, 0)",
    [randomUUID(), userId],
    nativeDB,
  )
}

/**
 * Checks whether a given idempotency reference (e.g. a payment webhook
 * event ID) has already been recorded as a wallet transaction. Callers
 * MUST check this before crediting, to guard against a webhook firing
 * more than once for the same payment.
 */
export async function referenceAlreadyProcessed(reference: string, nativeDB?: any): Promise<boolean> {
  const result = await d1Query(
    "SELECT id FROM wallet_transactions WHERE reference = ?",
    [reference],
    nativeDB,
  )
  return (result.results?.length ?? 0) > 0
}

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
  await ensureWalletExists(params.userId, nativeDB)

  if (await referenceAlreadyProcessed(params.reference, nativeDB)) {
    // Idempotent no-op — return current balance without double-crediting.
    const balance = await getWalletBalance(params.userId, nativeDB)
    return { newBalanceKobo: balance }
  }

  const current = await getWalletBalance(params.userId, nativeDB)
  const newBalance = current + params.amountKobo

  await d1Query(
    "UPDATE wallets SET balance_kobo = ?, updated_at = datetime('now') WHERE user_id = ?",
    [newBalance, params.userId],
    nativeDB,
  )

  await d1Query(
    `INSERT INTO wallet_transactions
      (id, user_id, type, direction, amount_kobo, balance_after_kobo, reference, provider_reference, related_order_id, status, metadata)
     VALUES (?, ?, ?, 'credit', ?, ?, ?, ?, ?, 'completed', ?)`,
    [
      randomUUID(),
      params.userId,
      params.type,
      params.amountKobo,
      newBalance,
      params.reference,
      params.providerReference ?? null,
      params.relatedOrderId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
    nativeDB,
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
  await ensureWalletExists(params.userId, nativeDB)

  if (await referenceAlreadyProcessed(params.reference, nativeDB)) {
    const balance = await getWalletBalance(params.userId, nativeDB)
    return { success: true, newBalanceKobo: balance }
  }

  const current = await getWalletBalance(params.userId, nativeDB)
  if (current < params.amountKobo) {
    return { success: false, newBalanceKobo: current, message: "Insufficient wallet balance" }
  }

  const newBalance = current - params.amountKobo

  await d1Query(
    "UPDATE wallets SET balance_kobo = ?, updated_at = datetime('now') WHERE user_id = ?",
    [newBalance, params.userId],
    nativeDB,
  )

  await d1Query(
    `INSERT INTO wallet_transactions
      (id, user_id, type, direction, amount_kobo, balance_after_kobo, reference, related_order_id, status, metadata)
     VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, 'completed', ?)`,
    [
      randomUUID(),
      params.userId,
      params.type,
      params.amountKobo,
      newBalance,
      params.reference,
      params.relatedOrderId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
    nativeDB,
  )

  return { success: true, newBalanceKobo: newBalance }
}

/** Reverses a previous debit (e.g. all VTU providers failed for an order, or a withdrawal was rejected). */
export async function refundWallet(
  params: { userId: string; amountKobo: number; reference: string; relatedOrderId?: string },
  nativeDB?: any,
): Promise<{ newBalanceKobo: number }> {
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
