// app/(dashboard)/referrals/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Users, Copy, Check, Gift, Share2 } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface Referral {
  id: string
  bonus_awarded: number
  bonus_kobo: number
  awarded_at: string | null
  created_at: string
}

interface ReferralData {
  referralCode: string | null
  bonusPerReferralKobo: number
  totalReferrals: number
  totalEarnedKobo: number
  referrals: Referral[]
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/referrals", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!cancelled) {
        setData(json)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const referralLink =
    data?.referralCode && typeof window !== "undefined"
      ? `${window.location.origin}/signup?ref=${data.referralCode}`
      : ""

  async function handleCopy() {
    if (!referralLink) return
    await navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShare() {
    if (!referralLink) return
    if (navigator.share) {
      await navigator.share({ title: "Join ZamoraxPay", url: referralLink })
    } else {
      handleCopy()
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">Refer & earn</h1>
      <p className="mt-1 text-sm text-secondary">
        Share your link — you earn a bonus when someone you refer completes their first
        purchase.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-lg shadow-emerald-900/10">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
          <Gift className="h-4 w-4" />
          Bonus per successful referral
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight">
          {loading ? "…" : formatNaira(data?.bonusPerReferralKobo ?? 0)}
        </p>

        <div className="mt-5 rounded-xl bg-white/10 p-3">
          <p className="text-xs font-medium text-emerald-100">Your referral link</p>
          <p className="mt-1 truncate text-sm font-medium">
            {loading ? "…" : referralLink || "Sign in to get your link"}
          </p>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleCopy}
            disabled={!referralLink}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            onClick={handleShare}
            disabled={!referralLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <Users className="h-4 w-4" />
            Total referrals
          </div>
          <p className="mt-1 text-2xl font-bold text-primary">
            {loading ? "…" : data?.totalReferrals ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <Gift className="h-4 w-4" />
            Total earned
          </div>
          <p className="mt-1 text-2xl font-bold text-primary">
            {loading ? "…" : formatNaira(data?.totalEarnedKobo ?? 0)}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Referral history</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-secondary">Loading…</p>
          ) : !data?.referrals.length ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Users className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-secondary">
                No referrals yet — share your link to start earning.
              </p>
            </div>
          ) : (
            data.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-primary">
                    {r.bonus_awarded ? "Bonus earned" : "Pending first purchase"}
                  </p>
                  <p className="text-xs text-secondary">
                    Joined {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-medium ${
                      r.bonus_awarded ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {r.bonus_awarded ? formatNaira(r.bonus_kobo) : "Not yet"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
