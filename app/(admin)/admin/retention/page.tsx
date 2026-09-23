// app/(admin)/admin/retention/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface JobStatus {
  key: string
  label: string
  action: "delete" | "blank" | "archive_delete"
  keeps: string
  days: number
  minDays: number
  eligibleRows: number | null
  lastRun: { at: string; status: string; rows: number; message: string | null; source: string } | null
}

interface RunRow {
  job_key: string
  trigger_source: string
  rows_affected: number
  status: string
  message: string | null
  started_at: string
}

interface JobResult {
  key: string
  status: string
  rowsAffected: number
  message: string
}

const ACTION_LABEL: Record<JobStatus["action"], string> = {
  delete: "Permanently deletes",
  blank: "Empties the data column of",
  archive_delete: "Copies to R2, then permanently deletes",
}

export default function AdminRetentionPage() {
  const [jobs, setJobs] = useState<JobStatus[]>([])
  const [recent, setRecent] = useState<RunRow[]>([])
  const [masterEnabled, setMasterEnabled] = useState(true)
  const [batchSize, setBatchSize] = useState("1000")
  const [timeBudget, setTimeBudget] = useState("40")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // job key, "all", or "save:<key>"
  const [confirming, setConfirming] = useState<string | null>(null) // job key or "all"
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [lastResults, setLastResults] = useState<JobResult[] | null>(null)

  async function authHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/retention", { headers: await authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to load")
      setJobs(data.jobs ?? [])
      setRecent(data.recentRuns ?? [])
      setMasterEnabled(data.masterEnabled)
      setBatchSize(String(data.batchSize))
      setTimeBudget(String(data.timeBudgetSeconds))
      setDrafts(Object.fromEntries((data.jobs ?? []).map((j: JobStatus) => [j.key, String(j.days)])))
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to load" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function patch(body: Record<string, unknown>, busyKey: string, okText: string) {
    setBusy(busyKey)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setMessage({ kind: "ok", text: okText })
      await load()
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Save failed" })
    } finally {
      setBusy(null)
    }
  }

  async function runNow(target: string) {
    setBusy(target)
    setMessage(null)
    setLastResults(null)
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(target === "all" ? { all: true, confirm: true } : { jobKey: target, confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Run failed")
      setLastResults(data.results ?? [])
      const total = (data.results ?? []).reduce((s: number, r: JobResult) => s + r.rowsAffected, 0)
      setMessage({ kind: "ok", text: `Done. ${total} row(s) processed.` })
      await load()
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Run failed" })
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  const totalDue = jobs.reduce((s, j) => s + (j.eligibleRows ?? 0), 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Data Retention</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keeps your database and storage small by removing old data on a schedule. Everything below is{" "}
          <strong>permanent</strong> once it runs. Wallet transactions and the audit log are copied to R2 first; the
          rest cannot be recovered. Set a job to <strong>0</strong> to turn it off.
        </p>
      </div>

      {message && (
        <div className={`rounded-md p-3 text-sm ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-accent/10 text-accent"}`}>
          {message.text}
        </div>
      )}

      {/* Master switch + run everything */}
      <div className="space-y-3 rounded-lg border border-border bg-white p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium text-secondary">Automatic cleanup (cron)</span>
            <span className="block text-xs text-muted-foreground">
              When off, the scheduled job does nothing. The buttons on this page still work.
            </span>
          </span>
          <input
            type="checkbox"
            checked={masterEnabled}
            disabled={busy !== null}
            onChange={(e) => patch({ masterEnabled: e.target.checked }, "master", e.target.checked ? "Automatic cleanup turned on." : "Automatic cleanup turned off.")}
            className="h-5 w-5"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div>
            <label className="text-xs text-muted-foreground">Rows per batch (100–5000)</label>
            <div className="mt-1 flex gap-2">
              <input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} inputMode="numeric" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
              <button
                onClick={() => patch({ setting: "batchSize", value: batchSize }, "save:batch", "Batch size saved.")}
                disabled={busy !== null}
                className="rounded-md border border-border px-3 text-xs font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Time budget, seconds (5–300)</label>
            <div className="mt-1 flex gap-2">
              <input value={timeBudget} onChange={(e) => setTimeBudget(e.target.value)} inputMode="numeric" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
              <button
                onClick={() => patch({ setting: "timeBudgetSeconds", value: timeBudget }, "save:budget", "Time budget saved.")}
                disabled={busy !== null}
                className="rounded-md border border-border px-3 text-xs font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {confirming === "all" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-medium">Delete everything that is currently due, across all {jobs.length} jobs?</p>
            <p className="mt-1 text-xs">About {totalDue.toLocaleString()} row(s) are due. This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => runNow("all")} disabled={busy !== null} className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy === "all" ? "Running…" : "Yes, delete all due data"}
              </button>
              <button onClick={() => setConfirming(null)} disabled={busy !== null} className="rounded-md border border-border bg-white px-3 py-2 text-xs font-medium">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming("all")}
            disabled={busy !== null || loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Delete all due data now
          </button>
        )}
      </div>

      {/* Jobs */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const draft = drafts[job.key] ?? String(job.days)
            const changed = draft !== String(job.days)
            return (
              <div key={job.key} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-secondary">{job.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACTION_LABEL[job.action]} rows older than the number of days below.
                      {job.keeps ? ` ${job.keeps}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${job.days === 0 ? "bg-gray-100 text-gray-600" : "bg-primary/10 text-primary"}`}>
                    {job.days === 0 ? "Off" : `${job.eligibleRows === null ? "?" : job.eligibleRows.toLocaleString()} due`}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Days (min {job.minDays}, 0 = off)</label>
                    <input
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [job.key]: e.target.value }))}
                      inputMode="numeric"
                      className="mt-1 block w-24 rounded-md border border-border px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => patch({ jobKey: job.key, days: Number(draft) }, `save:${job.key}`, `${job.label}: saved.`)}
                    disabled={!changed || busy !== null}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    {busy === `save:${job.key}` ? "Saving…" : "Save"}
                  </button>

                  {confirming === job.key ? (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-red-800">Permanently delete {job.eligibleRows ?? "?"} row(s)?</span>
                      <button onClick={() => runNow(job.key)} disabled={busy !== null} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                        {busy === job.key ? "Running…" : "Yes, delete"}
                      </button>
                      <button onClick={() => setConfirming(null)} disabled={busy !== null} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(job.key)}
                      disabled={busy !== null || job.days === 0 || changed}
                      title={changed ? "Save the new days first" : job.days === 0 ? "This job is off" : undefined}
                      className="ml-auto rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Delete now
                    </button>
                  )}
                </div>

                {job.lastRun && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last run ({job.lastRun.source}): {job.lastRun.at} UTC — {job.lastRun.status}, {job.lastRun.rows} row(s)
                    {job.lastRun.status !== "ok" && job.lastRun.message ? ` — ${job.lastRun.message}` : ""}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lastResults && (
        <div>
          <h2 className="mb-2 font-heading font-semibold text-secondary">Result of that run</h2>
          <div className="space-y-1">
            {lastResults.map((r) => (
              <div key={r.key} className={`rounded-md p-2 text-xs ${r.status === "error" ? "bg-red-50 text-red-800" : r.status === "partial" ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-secondary"}`}>
                <span className="font-medium">{r.key}</span> — {r.status}: {r.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-heading font-semibold text-secondary">Recent runs</h2>
          <div className="space-y-1">
            {recent.map((r, i) => (
              <div key={`${r.started_at}-${r.job_key}-${i}`} className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-xs">
                <span className="font-medium text-secondary">{r.job_key}</span>
                <span className="text-muted-foreground">
                  {r.trigger_source} · {r.status} · {r.rows_affected} row(s) · {r.started_at}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
