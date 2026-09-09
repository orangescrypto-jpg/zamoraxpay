// app/(dashboard)/cashback/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Gift, ShoppingBag } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface CashbackAwardRow {
  id: string
  order_id: string
  amount_kobo: number
  claimed: number
  claimed_at: string | null
  created_at: string
}

interface CashbackData {
  history: CashbackAwardRow[]
  unclaimedKobo: number
  lifetimeEarnedKobo: number
}

export default function CashbackPage() {
  const [data, setData] = useState<CashbackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/cashback", { headers })
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleClaim() {
    setClaiming(true)
    setResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/rewards/claim", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "cashback" }),
    })
    const json = await res.json()
    setResult({ success: json.success, message: json.message })
    setClaiming(false)
    if (json.success) {
      await load()
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">Cashback</h1>
      <p className="mt-1 text-sm text-secondary">
        Earn cashback automatically on qualifying purchases, then claim it to your wallet whenever you like.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-lg shadow-emerald-900/10">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
          <Gift className="h-4 w-4" />
          Unclaimed cashback
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {loading ? "…" : formatNaira(data?.unclaimedKobo ?? 0)}
        </p>
        <p className="mt-1 text-xs text-emerald-100/80">
          Usable for purchases and transfers once claimed, it can&apos;t be refunded.
        </p>

        <button
          onClick={handleClaim}
          disabled={loading || claiming || !data?.unclaimedKobo}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Gift className="h-4 w-4" />
          {claiming ? "Claiming..." : "Claim to wallet"}
        </button>

        {result && (
          <p className={`mt-3 text-sm ${result.success ? "text-white" : "text-emerald-100"}`}>{result.message}</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-white p-4">
        <p className="text-xs font-medium text-secondary">Lifetime cashback earned</p>
        <p className="mt-1 text-lg font-bold text-primary">
          {loading ? "…" : formatNaira(data?.lifetimeEarnedKobo ?? 0)}
        </p>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Cashback history</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-secondary">Loading…</p>
          ) : !data?.history.length ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <ShoppingBag className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-secondary">No cashback yet. Make a qualifying purchase to start earning.</p>
            </div>
          ) : (
            data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-primary">Order cashback</p>
                  <p className="text-xs text-secondary">{formatDate(h.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-emerald-600">{formatNaira(h.amount_kobo)}</p>
                  <p className="text-xs text-secondary">{h.claimed ? "Claimed" : "Unclaimed"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
