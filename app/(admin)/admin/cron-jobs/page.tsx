// app/(admin)/admin/cron-jobs/page.tsx
// New page. Admin manual-trigger gap: re-engagement, reconcile-pending-orders,
// and auto-reload had no admin UI at all (unlike retention, weekend-bonus,
// and spin, which each have their own page). Rather than three near-identical
// single-button pages, this combines all three behind one job picker — same
// "Run now" interaction as app/(admin)/admin/weekend-bonus/page.tsx, just
// switched by job. spin, retention, weekend-bonus, and reconcile-orphaned-orders
// keep their own dedicated pages/buttons since those also carry settings or a
// review queue beyond "run it now".
"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

type JobKey = "re-engagement" | "reconcile-pending-orders" | "auto-reload"

const JOBS: { key: JobKey; label: string; description: string; runLabel: string }[] = [
  {
    key: "re-engagement",
    label: "Re-engagement",
    description:
      "Runs every re-engagement push trigger now (streak at risk, unclaimed reward, idle wallet, weekend bonus live, referral nudge, inactivity win-back) instead of waiting for the hourly cron. Each trigger only nudges users not already nudged today, so it's safe to click more than once.",
    runLabel: "Run all triggers now",
  },
  {
    key: "reconcile-pending-orders",
    label: "Reconcile Pending Orders",
    description:
      "Re-queries every VTU order stuck in 'pending' against its own provider and resolves it — refunding on failure, awarding cashback/referral on confirmed success. Normally runs every 5 minutes.",
    runLabel: "Run reconciliation now",
  },
  {
    key: "auto-reload",
    label: "Auto-Reload",
    description:
      "Runs every auto-reload rule whose scheduled time has passed. Each rule debits the user's wallet, attempts the purchase, and refunds on failure. Rules for the same user always run in order; different users run concurrently.",
    runLabel: "Run due rules now",
  },
]

interface RunResult {
  [key: string]: unknown
  error?: string
}

export default function AdminCronJobsPage() {
  const [job, setJob] = useState<JobKey>("re-engagement")
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<JobKey, RunResult | null>>({
    "re-engagement": null,
    "reconcile-pending-orders": null,
    "auto-reload": null,
  })

  const active = JOBS.find((j) => j.key === job)!
  const lastResult = results[job]

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function runNow() {
    setRunning(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/admin/${job}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      })
      const data = await res.json()
      setResults((prev) => ({ ...prev, [job]: data }))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-heading font-bold">Cron Jobs</h1>

      <div className="flex flex-wrap gap-2">
        {JOBS.map((j) => (
          <button
            key={j.key}
            onClick={() => setJob(j.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              job === j.key ? "bg-primary text-primary-foreground" : "border border-border bg-white text-secondary hover:bg-muted"
            }`}
          >
            {j.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{active.description}</p>

      <div className="rounded-lg border border-border bg-white p-4">
        <button
          onClick={runNow}
          disabled={running}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? "Running..." : active.runLabel}
        </button>

        {lastResult && (
          <div className="mt-3">
            {lastResult.error ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{String(lastResult.error)}</p>
            ) : (
              <JobResultSummary job={job} result={lastResult} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function JobResultSummary({ job, result }: { job: JobKey; result: RunResult }) {
  if (job === "re-engagement") {
    const labels: Record<string, string> = {
      streakAtRisk: "Streak at risk",
      unclaimedReward: "Unclaimed reward",
      walletIdle: "Idle wallet",
      weekendBonusLive: "Weekend bonus live",
      referralNudge: "Referral nudge",
      inactivityWinback: "Inactivity win-back",
    }
    return (
      <div className="space-y-2">
        {Object.entries(labels).map(([key, label]) => {
          const r = result[key] as { eligible: number; sent: number } | undefined
          if (!r) return null
          return (
            <div key={key} className="flex items-center justify-between rounded-md bg-accent/10 p-3 text-sm text-accent">
              <span>{label}</span>
              <span>
                {r.sent} sent / {r.eligible} eligible
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  if (job === "reconcile-pending-orders") {
    const checked = result.checked as number | undefined
    const orderResults = (result.results ?? []) as Array<{ orderId: string; resolvedTo: string; message: string }>
    const byOutcome = orderResults.reduce<Record<string, number>>((acc, r) => {
      acc[r.resolvedTo] = (acc[r.resolvedTo] ?? 0) + 1
      return acc
    }, {})
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-accent/10 p-3 text-sm text-accent">Checked {checked ?? 0} pending order(s).</p>
        {Object.entries(byOutcome).map(([outcome, count]) => (
          <div key={outcome} className="flex items-center justify-between rounded-md bg-muted p-2 text-xs text-secondary">
            <span className="capitalize">{outcome.replace(/_/g, " ")}</span>
            <span>{count}</span>
          </div>
        ))}
      </div>
    )
  }

  // auto-reload
  const processed = result.processed as number | undefined
  const ruleResults = (result.results ?? []) as Array<{ ruleId: string; success: boolean; message: string }>
  const succeeded = ruleResults.filter((r) => r.success).length
  const failed = ruleResults.length - succeeded
  return (
    <div className="space-y-2">
      <p className="rounded-md bg-accent/10 p-3 text-sm text-accent">
        Processed {processed ?? 0} rule(s) — {succeeded} succeeded, {failed} failed.
      </p>
      {ruleResults.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {ruleResults.map((r) => (
            <div
              key={r.ruleId}
              className={`rounded-md p-2 text-xs ${r.success ? "bg-accent/5 text-accent" : "bg-amber-50 text-amber-900"}`}
            >
              <span className="font-mono">{r.ruleId}</span> — {r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
