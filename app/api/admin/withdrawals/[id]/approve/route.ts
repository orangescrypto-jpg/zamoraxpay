// app/api/admin/withdrawals/[id]/approve/route.ts
// Approves a pending withdrawal. Two modes, chosen by the admin per
// the site-wide withdrawal_payout_method setting AND, for automated
// mode, which provider (Korapay or Paystack) to send it through —
// admin picks whichever account they actually have Transfer-enabled
// on and confirms the account is correct before sending real money.
//
// This is a money-moving action — requireAdmin, not requireStaff.
// Moderators can view the withdrawal queue but not approve/send funds.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { markWithdrawalPaidManually, markWithdrawalApprovedAutomated } from "@/src/services/withdrawals"
import { getPaymentAdapter } from "@/src/services/providers/payment/registry"
import { getPaymentProviderCredentials } from "@/src/services/config"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params

  try {
    const { mode, proofUrl, provider } = await req.json()
    // mode: 'manual' | 'automated'
    // provider (automated only): 'korapay' | 'paystack' — admin's choice,
    // confirmed at approval time, not locked to whichever gateway the
    // user happened to fund with.

    const withdrawalResult = await d1Query("SELECT * FROM withdrawals WHERE id = ?", [id])
    const withdrawal = withdrawalResult.results?.[0]
    if (!withdrawal) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
    if (withdrawal.status !== "pending") {
      return NextResponse.json({ error: `Withdrawal is already ${withdrawal.status}` }, { status: 400 })
    }

    if (mode === "manual") {
      await markWithdrawalPaidManually(id, proofUrl ?? null, auth.uid)
      return NextResponse.json({ success: true, message: "Marked as paid manually" })
    }

    if (mode === "automated") {
      if (!provider || !["korapay", "paystack"].includes(provider)) {
        return NextResponse.json({ error: "provider must be 'korapay' or 'paystack' for automated payout" }, { status: 400 })
      }
      if (!withdrawal.bank_code) {
        return NextResponse.json(
          { error: "This withdrawal has no bank code on file, so it can't be sent automatically. Use manual payout instead, or ask the user to re-submit with their bank selected from the list." },
          { status: 400 },
        )
      }

      const adapter = getPaymentAdapter(provider)
      if (!adapter) return NextResponse.json({ error: "Unknown payment provider" }, { status: 400 })

      const credentials = await getPaymentProviderCredentials(provider)
      const result = await adapter.transfer(
        {
          amountKobo: withdrawal.net_amount_kobo,
          accountNumber: withdrawal.account_number,
          bankCode: withdrawal.bank_code,
          accountName: withdrawal.account_name,
          reference: `ZPWDXFER-${id}`,
          reason: "ZamoraxPay wallet withdrawal",
        },
        credentials,
      )

      if (!result.success && result.status === "failed") {
        return NextResponse.json({ error: result.message }, { status: 502 })
      }

      await markWithdrawalApprovedAutomated(id, provider, result.providerTransferReference ?? `ZPWDXFER-${id}`, auth.uid)

      return NextResponse.json({
        success: true,
        message: `Transfer initiated via ${provider} (${result.status}). Status will update once the provider confirms.`,
      })
    }

    return NextResponse.json({ error: "mode must be 'manual' or 'automated'" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Approval failed" }, { status: 500 })
  }
}
