// app/(dashboard)/wallet/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000] // kobo

export default function WalletPage() {
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadBalance() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/wallet/balance", { headers })
    const data = await res.json()
    setBalanceKobo(data.balanceKobo ?? 0)
  }

  useEffect(() => {
    loadBalance()
  }, [])

  async function handleFund() {
    setError(null)
    const amountKobo = Math.round(parseFloat(amount) * 100)
    if (!amountKobo || amountKobo < 10000) {
      setError("Minimum funding amount is ₦100")
      return
    }

    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/wallet/fund", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ amountKobo }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to initialize payment")
      return
    }

    window.location.href = data.authorizationUrl
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">Wallet</h1>
        <Link href="/withdraw" className="text-sm font-medium text-primary hover:underline">
          Withdraw →
        </Link>
      </div>

      <div className="mb-6 rounded-lg bg-secondary p-6 text-white">
        <p className="text-sm text-white/70">Current balance</p>
        <p className="mt-1 text-3xl font-heading font-bold">
          {balanceKobo === null ? "..." : formatNaira(balanceKobo)}
        </p>
      </div>

      <h2 className="mb-3 font-heading font-semibold text-secondary">Fund your wallet</h2>

      {error && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="mb-3 grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((kobo) => (
          <button
            key={kobo}
            onClick={() => setAmount((kobo / 100).toString())}
            className="rounded-md border border-border py-2 text-sm font-medium hover:border-primary hover:text-primary"
          >
            ₦{(kobo / 100).toLocaleString()}
          </button>
        ))}
      </div>

      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Enter amount"
        className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm"
      />

      <button
        onClick={handleFund}
        disabled={loading || !amount}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Redirecting to payment..." : "Fund wallet"}
      </button>
    </div>
  )
}
