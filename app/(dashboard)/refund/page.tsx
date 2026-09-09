// app/(dashboard)/refund/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"
import { NIGERIAN_BANKS } from "@/constants/nigerianBanks"

interface FundingSource {
  id: string
  account_number: string
  account_name: string | null
  bank_name: string | null
  bank_code: string | null
}

interface WithdrawalRow {
  id: string
  amount_kobo: number
  net_amount_kobo: number
  status: string
  bank_name: string
  account_number: string
  created_at: string
  rejection_reason: string | null
}

export default function RefundPage() {
  const [withdrawableKobo, setWithdrawableKobo] = useState<number | null>(null)
  const [history, setHistory] = useState<WithdrawalRow[]>([])
  const [sources, setSources] = useState<FundingSource[]>([])
  const [selectedAccount, setSelectedAccount] = useState("")
  const [manualBankCode, setManualBankCode] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [withdrawalEnabled, setWithdrawalEnabled] = useState(true)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const [withdrawRes, sourcesRes, statusRes] = await Promise.all([
      fetch("/api/wallet/withdraw", { headers }),
      fetch("/api/wallet/funding-sources", { headers }),
      fetch("/api/withdrawal-status"),
    ])
    const withdrawData = await withdrawRes.json()
    const sourcesData = await sourcesRes.json()
    const statusData = await statusRes.json()

    setWithdrawableKobo(withdrawData.withdrawableBalanceKobo ?? 0)
    setHistory(withdrawData.withdrawals ?? [])
    setSources(sourcesData.sources ?? [])
    setWithdrawalEnabled(statusData.enabled ?? true)
    if (sourcesData.sources?.length === 1) setSelectedAccount(sourcesData.sources[0].id)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    const source = sources.find((s) => s.id === selectedAccount)
    if (!source) {
      setResult({ success: false, message: "Please select an account you've funded from before" })
      return
    }

    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        amountKobo: Math.round(parseFloat(amount) * 100),
        bankName: source.bank_name ?? "",
        accountNumber: source.account_number,
        accountName: source.account_name ?? "",
        bankCode: source.bank_code ?? manualBankCode ?? undefined,
      }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: res.ok && data.success, message: data.message ?? data.error })

    if (res.ok && data.success) {
      setAmount("")
      load()
    }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Refund</h1>

      <div className="mb-6 rounded-lg bg-secondary p-6 text-white">
        <p className="text-sm text-white/70">Refundable balance</p>
        <p className="mt-1 text-3xl font-heading font-bold">
          {withdrawableKobo === null ? "..." : formatNaira(withdrawableKobo)}
        </p>
        <p className="mt-2 text-xs text-white/50">
          Deposited funds only. Cashback and referral bonus can&apos;t be refunded, they can only be used for purchases.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Wallet funding errors</p>
        <p className="mt-1">
          Deposits made to this platform are intended solely for airtime, data, and bill payments. If you fund your
          wallet by mistake, refunds can only be processed back to the originating bank account and may take up to
          48 hours to clear.
        </p>
      </div>

      {!withdrawalEnabled ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Refunds are temporarily unavailable. Please check back later.
        </div>
      ) : sources.length === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Wallet funding errors: Deposits made to this platform are intended solely for airtime, data, and bill
          payments. If you fund your wallet by mistake, refunds can only be processed back to the originating bank
          account and may take up to 48 hours to clear.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mb-8 space-y-4">
          {result && (
            <p className={`rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
              {result.message}
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Refund to</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Select an account</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.bank_name ?? "Bank"} · {s.account_number} {s.account_name ? `(${s.account_name})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Only accounts you&apos;ve funded your wallet from before are eligible.
            </p>
          </div>

          {selectedAccount && !sources.find((s) => s.id === selectedAccount)?.bank_code && (
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Confirm your bank</label>
              <select
                required
                value={manualBankCode}
                onChange={(e) => setManualBankCode(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                <option value="">Select your bank</option>
                {NIGERIAN_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                We couldn&apos;t automatically detect your bank from your deposit, so please confirm it so we can pay
                you correctly.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Amount (₦)</label>
            <input
              required
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !selectedAccount || !amount}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Request refund"}
          </button>
        </form>
      )}

      <h2 className="mb-3 font-heading font-semibold text-secondary">History</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No refund requests yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((w) => (
            <div key={w.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-secondary">{formatNaira(w.net_amount_kobo)}</span>
                <span
                  className={`text-xs font-medium capitalize ${
                    w.status === "paid"
                      ? "text-accent"
                      : w.status === "rejected" || w.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {w.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {w.bank_name} · {w.account_number} · {formatDate(w.created_at)}
              </p>
              {w.rejection_reason && <p className="mt-1 text-xs text-destructive">{w.rejection_reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
