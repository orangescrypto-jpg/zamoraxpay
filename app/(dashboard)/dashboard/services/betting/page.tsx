// app/(dashboard)/services/betting/page.tsx
"use client"

import { useState } from "react"
import { ResultBanner } from "@/components/ui/result-banner"
import { PinKeypad } from "@/components/ui/pin-keypad"
import { createClient } from "@/src/services/providers/supabase/client"

const PLATFORMS = ["Bet9ja", "SportyBet", "NairaBet", "BetKing", "1xBet"]

export default function BettingPage() {
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [accountId, setAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/betting", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ platform, accountId, amountKobo: Math.round(parseFloat(amount) * 100), transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setAccountId(""); setAmount(""); setPin("") }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Fund Betting Wallet</h1>

      {result && (
        <ResultBanner
          className="mb-4"
          variant={result.success ? "success" : "error"}
          title={result.success ? "Success" : "Purchase failed"}
          message={result.message}
          onDismiss={() => setResult(null)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm">
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Account ID / User ID</label>
          <input required value={accountId} onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Amount (₦)</label>
          <input required type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-secondary dark:text-foreground">Transaction PIN</label>
          <PinKeypad value={pin} onChange={setPin} disabled={loading} />
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Fund wallet"}
        </button>
      </form>
    </div>
  )
}
