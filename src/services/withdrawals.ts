// src/services/withdrawals.ts
// Service abstraction layer — withdrawals.
//
// THE ELIGIBLE-BALANCE RULE (per product decision): a user's single
// wallet balance is not literally split into separate "buckets" in
// storage — instead, eligibility is computed from the ledger:
//   - 'funding' credits and 'referral_bonus' credits count toward the
//     withdrawable total
//   - 'cashback' credits do NOT — cashback is spend-only, forever
//   - Every debit (purchase, reseller_upgrade, existing withdrawal)
//     reduces the withdrawable total, in the order it actually
//     happened, so we're never letting someone withdraw money that's
//     already been spent — including spending cashback that "shares
//     the pool" with the wallet.
//
// The simplest CORRECT way to compute this without a second balance
// column (which would need to be kept in perfect lockstep with every
// future feature that touches the wallet) is: withdrawable amount =
// min(current wallet balance, sum of funding+referral_bonus credits
// minus sum of all debits and prior withdrawals). This treats
// cashback as the last money spent, conceptually — which matches "you
// can spend cashback, but you can't withdraw it": if cashback is
// sitting unspent, it simply doesn't count toward what you can pull
// out, and if it's been spent already, it's already gone from
// everyone's math.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { getWalletBalance, debitWallet, refundWallet } from "@/src/services/wallet"
import { findMatchingFundingSource } from "@/src/services/fundingSource"
import { getSettingNumber, getSetting } from "@/src/services/siteSettings"

export async function getWithdrawableBalance(userId: string, nativeDB?: any): Promise<number> {
  const [currentBalance, creditSums, debitSum] = await Promise.all([
    getWalletBalance(userId, nativeDB),
    d1Query(
      `SELECT type, COALESCE(SUM(amount_kobo), 0) AS total FROM wallet_transactions
       WHERE user_id = ? AND direction = 'credit' AND status = 'completed'
       GROUP BY type`,
      [userId],
      nativeDB,
    ),
    d1Query(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM wallet_transactions
       WHERE user_id = ? AND direction = 'debit' AND status = 'completed'`,
      [userId],
      nativeDB,
    ),
  ])

  const credits: Record<string, number> = {}
  for (const row of creditSums.results ?? []) credits[row.type] = row.total

  const withdrawableCredits = (credits.funding ?? 0) + (credits.referral_bonus ?? 0)
  const totalDebits = debitSum.results?.[0]?.total ?? 0

  const withdrawable = withdrawableCredits - totalDebits
  // Never report more than the actual current balance (a safety clamp
  // in case of any rounding/edge-case drift) and never negative.
  return Math.max(0, Math.min(withdrawable, currentBalance))
}

export interface WithdrawalRequestResult {
  success: boolean
  withdrawalId?: string
  message: string
}

export async function requestWithdrawal(
  params: {
    userId: string
    amountKobo: number
    bankName: string
    accountNumber: string
    accountName: string
    bankCode?: string
  },
  nativeDB?: any,
): Promise<WithdrawalRequestResult> {
  const minAmount = await getSettingNumber("withdrawal_min_amount_kobo", 100000, nativeDB)
  if (params.amountKobo < minAmount) {
    return { success: false, message: `Minimum withdrawal is ₦${(minAmount / 100).toLocaleString()}` }
  }

  const withdrawable = await getWithdrawableBalance(params.userId, nativeDB)
  if (params.amountKobo > withdrawable) {
    return {
      success: false,
      message: `You can withdraw up to ₦${(withdrawable / 100).toLocaleString()}. Cashback balance is not withdrawable — it can only be used for purchases.`,
    }
  }

  // Mandatory guardrail: the destination account must be one this
  // user has actually funded their wallet from before.
  const matchedSourceId = await findMatchingFundingSource(params.userId, params.accountNumber, nativeDB)
  if (!matchedSourceId) {
    return {
      success: false,
      message: "You can only withdraw to a bank account you've previously funded your wallet from. Fund from this account first, or choose an account you've used before.",
    }
  }

  const feeKobo = await getSettingNumber("withdrawal_fee_kobo", 0, nativeDB)
  const netAmountKobo = Math.max(0, params.amountKobo - feeKobo)

  // Deduct immediately (held pending admin processing) — same pattern
  // Zamorax Marketplace uses for seller withdrawals.
  const withdrawalId = randomUUID()
  const debit = await debitWallet(
    {
      userId: params.userId,
      amountKobo: params.amountKobo,
      type: "admin_adjustment", // ledger type; withdrawals table is the real record
      reference: `ZPWD-${withdrawalId}`,
      metadata: { kind: "withdrawal_request", withdrawalId },
    },
    nativeDB,
  )

  if (!debit.success) {
    return { success: false, message: debit.message ?? "Insufficient balance" }
  }

  await d1Query(
    `INSERT INTO withdrawals
      (id, user_id, amount_kobo, fee_kobo, net_amount_kobo, bank_name, account_number, account_name, bank_code, matched_funding_source_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      withdrawalId,
      params.userId,
      params.amountKobo,
      feeKobo,
      netAmountKobo,
      params.bankName,
      params.accountNumber,
      params.accountName,
      params.bankCode ?? null,
      matchedSourceId,
    ],
    nativeDB,
  )

  return { success: true, withdrawalId, message: "Withdrawal request submitted. You'll be notified once it's processed." }
}

/** Admin rejects a withdrawal — refunds the held amount back to the wallet. */
export async function rejectWithdrawal(
  withdrawalId: string,
  reason: string,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  const result = await d1Query("SELECT * FROM withdrawals WHERE id = ?", [withdrawalId], nativeDB)
  const withdrawal = result.results?.[0]
  if (!withdrawal || withdrawal.status !== "pending") return

  await refundWallet(
    {
      userId: withdrawal.user_id,
      amountKobo: withdrawal.amount_kobo,
      reference: `ZPWDREF-${withdrawalId}`,
    },
    nativeDB,
  )

  await d1Query(
    `UPDATE withdrawals SET status = 'rejected', rejection_reason = ?, processed_by = ?, processed_at = datetime('now') WHERE id = ?`,
    [reason, adminUserId, withdrawalId],
    nativeDB,
  )
}

/** Admin marks a withdrawal as paid manually (bank transfer sent by hand). */
export async function markWithdrawalPaidManually(
  withdrawalId: string,
  proofUrl: string | null,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE withdrawals SET status = 'paid', payout_method = 'manual', proof_url = ?, processed_by = ?, processed_at = datetime('now') WHERE id = ?`,
    [proofUrl, adminUserId, withdrawalId],
    nativeDB,
  )
}

/** Admin marks a withdrawal as approved and en route via an automated provider transfer. */
export async function markWithdrawalApprovedAutomated(
  withdrawalId: string,
  payoutMethod: "korapay" | "paystack",
  providerTransferReference: string,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `UPDATE withdrawals SET status = 'approved', payout_method = ?, provider_transfer_reference = ?, processed_by = ?, processed_at = datetime('now') WHERE id = ?`,
    [payoutMethod, providerTransferReference, adminUserId, withdrawalId],
    nativeDB,
  )
}

export async function getConfiguredPayoutMethod(nativeDB?: any): Promise<"manual" | "automatic"> {
  const value = await getSetting("withdrawal_payout_method", nativeDB)
  return value === "automatic" ? "automatic" : "manual"
}
