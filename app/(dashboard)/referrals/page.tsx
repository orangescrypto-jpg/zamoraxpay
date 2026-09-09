// app/(dashboard)/rewards/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Gift, Users, Flame, ArrowRight } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface UnclaimedSummary {
  cashbackUnclaimedKobo: number
  referralUnclaimedKobo: number
  streakUnclaimedKobo: number
}

type ClaimSource = "cashback" | "referral" | "streak"

export default function RewardsPage() {
  const [summary, setSummary] = useState<UnclaimedSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<ClaimSource | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/rewards/claim", { headers })
    const json = await res.json()
    setSummary(json)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleClaim(source: ClaimSource) {
    setClaiming(source)
    setResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/rewards/claim", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    })
    const json = await res.json()
    setResult({ success: json.success, message: json.message })
    setClaiming(null)
    if (json.success) {
      await load()
    }
  }

  const cards = [
    {
      source: "cashback" as ClaimSource,
      label: "Cashback",
      amountKobo: summary?.cashbackUnclaimedKobo ?? 0,
      icon: Gift,
      colorClass: "from-emerald-600 to-emerald-800",
      link: "/cashback",
    },
    {
      source: "referral" as ClaimSource,
      label: "Referral bonus",
      amountKobo: summary?.referralUnclaimedKobo ?? 0,
      icon: Users,
      colorClass: "from-blue-600 to-blue-800",
      link: "/referrals",
    },
    {
      source: "streak" as ClaimSource,
      label: "Daily check-in",
      amountKobo: summary?.streakUnclaimedKobo ?? 0,
      icon: Flame,
      colorClass: "from-orange-500 to-amber-600",
      link: "/daily-streak",
    },
  ]

  const totalUnclaimedKobo =
    (summary?.cashbackUnclaimedKobo ?? 0) + (summary?.referralUnclaimedKobo ?? 0) + (summary?.streakUnclaimedKobo ?? 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">Rewards</h1>
      <p className="mt-1 text-sm text-secondary">
        Claim your cashback, referral bonus, and daily check-in rewards to your wallet. Once claimed, the amount
        is transferable and shows up in your transaction history.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-white p-4">
        <p className="text-xs font-medium text-secondary">Total unclaimed</p>
        <p className="mt-1 text-2xl font-bold text-primary">
          {loading ? "…" : formatNaira(totalUnclaimedKobo)}
        </p>
      </div>

      {result && (
        <p className={`mt-4 rounded-md p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {result.message}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.source}
              className={`overflow-hidden rounded-2xl bg-gradient-to-br ${card.colorClass} p-5 text-white shadow-lg`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Icon className="h-4 w-4" />
                    {card.label}
                  </div>
                  <p className="mt-1 text-2xl font-bold tracking-tight">
                    {loading ? "…" : formatNaira(card.amountKobo)}
                  </p>
                </div>
                <button
                  onClick={() => handleClaim(card.source)}
                  disabled={loading || claiming === card.source || !card.amountKobo}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {claiming === card.source ? "Claiming..." : "Claim"}
                </button>
              </div>
              <Link
                href={card.link}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white"
              >
                View details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-secondary/70">
        Cashback and referral bonus stay usable for purchases and transfers once claimed, they cannot be refunded to
        a bank account. Daily check-in rewards work the same way.
      </p>
    </div>
  )
}
