// src/services/fundingSource.ts
// Service abstraction layer — records which bank account a user
// funded their wallet FROM (captured from Korapay/Paystack webhook
// payloads). This is the source of truth for the withdrawal
// guardrail: a user may only withdraw to an account that appears
// here for their own user id.
//
// Korapay and Paystack expose the paying customer's bank account
// differently depending on the payment channel (bank transfer vs
// card), and sometimes don't expose it at all (e.g. a card payment
// has no "account number" in the traditional sense) — this function
// is defensive about that and simply does nothing if the payload
// doesn't contain identifiable bank account details.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"

export interface FundingSourceDetails {
  accountNumber: string
  accountName?: string
  bankName?: string
  bankCode?: string
}

export async function recordFundingSource(
  userId: string,
  provider: "korapay" | "paystack",
  details: FundingSourceDetails | null,
  nativeDB?: any,
): Promise<void> {
  if (!details?.accountNumber) return // nothing identifiable to record (e.g. card payment)

  const existing = await d1Query(
    "SELECT id FROM funding_source_accounts WHERE user_id = ? AND account_number = ?",
    [userId, details.accountNumber],
    nativeDB,
  )

  if (existing.results?.length) {
    await d1Query(
      "UPDATE funding_source_accounts SET last_seen_at = datetime('now'), account_name = COALESCE(?, account_name), bank_name = COALESCE(?, bank_name) WHERE id = ?",
      [details.accountName ?? null, details.bankName ?? null, existing.results[0].id],
      nativeDB,
    )
    return
  }

  await d1Query(
    `INSERT INTO funding_source_accounts (id, user_id, account_number, account_name, bank_name, bank_code, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, details.accountNumber, details.accountName ?? null, details.bankName ?? null, details.bankCode ?? null, provider],
    nativeDB,
  )
}

export async function getUserFundingSources(userId: string, nativeDB?: any) {
  const result = await d1Query(
    "SELECT * FROM funding_source_accounts WHERE user_id = ? ORDER BY last_seen_at DESC",
    [userId],
    nativeDB,
  )
  return result.results ?? []
}

/**
 * The withdrawal guardrail check: does this account number belong to
 * an account this user has actually funded from before? Returns the
 * matching funding_source_accounts row id if so (stored on the
 * withdrawal as proof), or null if not.
 */
export async function findMatchingFundingSource(
  userId: string,
  accountNumber: string,
  nativeDB?: any,
): Promise<string | null> {
  const result = await d1Query(
    "SELECT id FROM funding_source_accounts WHERE user_id = ? AND account_number = ? LIMIT 1",
    [userId, accountNumber],
    nativeDB,
  )
  return result.results?.[0]?.id ?? null
}

/** Extracts identifiable bank account details from a Korapay charge.success payload, if present. */
export function extractKorapayFundingSource(payload: any): FundingSourceDetails | null {
  const data = payload?.data
  // Korapay bank-transfer charges expose payer details under different
  // keys depending on channel/version — check the common shapes.
  const payer = data?.payment_source_information ?? data?.authorization ?? data?.customer
  const accountNumber = payer?.account_number ?? payer?.sender_account_number
  if (!accountNumber) return null

  return {
    accountNumber,
    accountName: payer?.account_name ?? payer?.sender_account_name ?? data?.customer?.name,
    bankName: payer?.bank_name ?? payer?.sender_bank,
    bankCode: payer?.bank_code,
  }
}

/** Extracts identifiable bank account details from a Paystack charge.success payload, if present. */
export function extractPaystackFundingSource(payload: any): FundingSourceDetails | null {
  const data = payload?.data
  // Paystack card payments include `authorization` (card, not a bank
  // account) — only bank-transfer/dedicated-virtual-account channels
  // carry a real account number. `authorization.sender_bank_account_number`
  // appears on some transfer-based channels; fall back gracefully.
  const auth = data?.authorization
  const accountNumber = auth?.sender_bank_account_number ?? auth?.account_number
  if (!accountNumber) return null

  return {
    accountNumber,
    accountName: auth?.sender_name ?? auth?.account_name,
    bankName: auth?.sender_bank ?? auth?.bank,
    bankCode: auth?.bank_code ?? auth?.sort_code,
  }
}
