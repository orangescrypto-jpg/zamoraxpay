// app/(dashboard)/daily-streak/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Flame, Calendar, Gift } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface CheckinHistoryRow {
  id: string
  period_key: string
  streak_day: number
  amount_kobo: number
  claimed: number
  claimed_at: string | null
  created_at: string
}

interface StreakData {
  currentStreak: number
  lastCheckinDate: string | null
  canCheckInToday: boolean
  alreadyCheckedInToday: boolean
  nextRewardKobo: number
  graceAvailable: boolean
  unclaimedKobo: number
  history: CheckinHistoryRow[]
}

export default function DailyStreakPage() {
  const [data, setData] = useState<StreakData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
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
    const res = await fetch("/api/daily-streak", { headers })
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCheckIn() {
    setCheckingIn(true)
    setResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/daily-streak", { method: "POST", headers })
    const json = await res.json()
    setResult({ success: json.success, message: json.message })
    setCheckingIn(false)
    if (json.success) {
      await load()
    }
  }

  async function handleClaim() {
    setClaiming(true)
    setResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/rewards/claim", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "streak" }),
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
      <h1 className="text-2xl font-bold text-primary">Daily check-in</h1>
      <p className="mt-1 text-sm text-secondary">
        Check in every day to grow your streak. The longer your streak, the bigger the reward.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-6 text-white shadow-lg shadow-orange-900/10">
        <div className="flex items-center gap-2 text-sm font-medium text-orange-100">
          <Flame className="h-4 w-4" />
          Current streak
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight">
          {loading ? "…" : `Day ${data?.currentStreak ?? 0}`}
        </p>

        {!loading && data && (
          <p className="mt-1 text-xs text-orange-100/80">
            {data.alreadyCheckedInToday
              ? "You've checked in today. Come back tomorrow to continue your streak."
              : `Check in today for ${formatNaira(data.nextRewardKobo)}`}
          </p>
        )}

        <button
          onClick={handleCheckIn}
          disabled={loading || checkingIn || !data?.canCheckInToday}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Gift className="h-4 w-4" />
          {checkingIn ? "Checking in..." : data?.alreadyCheckedInToday ? "Checked in for today" : "Check in now"}
        </button>

        {result && (
          <p className={`mt-3 text-sm ${result.success ? "text-white" : "text-orange-100"}`}>{result.message}</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-white p-4">
        <div>
          <p className="text-xs font-medium text-secondary">Unclaimed check-in rewards</p>
          <p className="mt-1 text-lg font-bold text-primary">
            {loading ? "…" : formatNaira(data?.unclaimedKobo ?? 0)}
          </p>
        </div>
        <button
          onClick={handleClaim}
          disabled={loading || claiming || !data?.unclaimedKobo}
          className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claiming ? "Claiming..." : "Claim to wallet"}
        </button>
      </div>

      {!loading && data?.graceAvailable && (
        <p className="mt-3 text-xs text-secondary/70">
          You have a grace day available this week, missing one day won&apos;t break your streak.
        </p>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Check-in history</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-secondary">Loading…</p>
          ) : !data?.history.length ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Calendar className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-secondary">No check-ins yet, start your streak today.</p>
            </div>
          ) : (
            data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-primary">Day {h.streak_day}</p>
                  <p className="text-xs text-secondary">{new Date(h.created_at).toLocaleDateString()}</p>
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
