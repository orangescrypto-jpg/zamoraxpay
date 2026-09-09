// app/(admin)/admin/weekend-bonus/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface RunSummary {
  period_key: string
  paid_count: number
  total_kobo: number
  last_paid_at: string
}

interface RunResult {
  ran: boolean
  reason?: string
  periodKey?: string
  amountKobo?: number
  eligibleUsers?: number
  paidCount?: number
  skippedCount?: number
  error?: string
}

export default function AdminWeekendBonusPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<RunResult | null>(null)
  const [forceDay, setForceDay] = useState(false)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadRuns() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/weekend-bonus", { headers })
    const data = await res.json()
    setRuns(data.runs ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadRuns()
  }, [])

  async function runNow() {
    setRunning(true)
    setLastResult(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/admin/weekend-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ ignoreDayCheck: forceDay }),
      })
      const data = await res.json()
      setLastResult(data)
      await loadRuns()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Weekend Bonus</h1>
        <Link href="/admin/settings" className="text-xs font-medium text-primary underline">
          Edit amount &amp; days
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        This normally runs automatically once a day via cron and only pays out on the configured
        weekend days. Use the button below to trigger it manually instead of waiting for the cron —
        for example, to pay it right now, or to catch up a day that was missed. It's safe to click
        even if the cron already ran today: anyone already paid for today won't be paid twice.
      </p>

      <div className="rounded-lg border border-border bg-white p-4">
        <label className="mb-3 flex items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={forceDay} onChange={(e) => setForceDay(e.target.checked)} className="h-4 w-4" />
          Run even if today isn't a configured weekend day
        </label>

        <button
          onClick={runNow}
          disabled={running}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? "Running..." : "Run weekend bonus now"}
        </button>

        {lastResult && (
          <div
            className={`mt-3 rounded-md p-3 text-sm ${
              lastResult.error || lastResult.ran === false
                ? "bg-amber-50 text-amber-900"
                : "bg-accent/10 text-accent"
            }`}
          >
            {lastResult.error ? (
              lastResult.error
            ) : lastResult.ran === false ? (
              lastResult.reason
            ) : (
              <>
                Paid {lastResult.paidCount} of {lastResult.eligibleUsers} eligible users
                {lastResult.amountKobo ? ` at ${formatNaira(lastResult.amountKobo)} each` : ""}
                {lastResult.skippedCount ? ` — ${lastResult.skippedCount} already paid today` : ""}.
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-heading font-semibold text-secondary">Recent Runs</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weekend bonus payouts yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.period_key} className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm">
                <span className="font-medium text-secondary">{run.period_key}</span>
                <span className="text-muted-foreground">
                  {run.paid_count} users · {formatNaira(run.total_kobo)} total
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
