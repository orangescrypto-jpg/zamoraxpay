// app/(dashboard)/dashboard/services/scheduled-bills/page.tsx
// Lists every auto-reload rule (electricity, data, etc.) so the user can
// pause/resume or cancel a scheduled payment.
//
// FIX (audit finding): this UI previously called POST/PATCH/DELETE on
// /api/auto-reload while that route only exported a cron-triggered GET —
// every management action 405'd and the rule list 401'd (it expected the
// cron bearer). /api/auto-reload is now a user-scoped CRUD route and this
// page works end to end. Also polished: skeleton loading rows instead of
// literal "..." text, dark-mode-safe tints, toast feedback on actions,
// and an inline confirm step instead of window.confirm.
"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { useToast } from "@/components/shared/ToastProvider"
import { formatNaira } from "@/lib/utils"

interface Rule {
  id: string
  service_type: string
  plan_code: string | null
  amount_kobo: number
  frequency: "daily" | "weekly" | "monthly"
  next_run_at: string
  is_active: number
  recipient: string
  network_or_biller: string
  nickname: string | null
}

function serviceLabel(serviceType: string) {
  if (serviceType === "electricity") return "Electricity"
  if (serviceType === "data") return "Data"
  if (serviceType === "airtime") return "Airtime"
  if (serviceType === "cable") return "Cable"
  if (serviceType === "betting") return "Betting"
  return serviceType
}

function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading scheduled payments">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border p-4">
          <div className="mb-3 h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mb-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export default function ScheduledBillsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const toast = useToast()

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/auto-reload", { headers })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Could not load scheduled payments")
        return
      }
      setRules(data.rules ?? [])
    } catch {
      setError("Could not load scheduled payments")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  async function toggleActive(rule: Rule) {
    setBusyId(rule.id)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/auto-reload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id: rule.id, isActive: rule.is_active !== 1 }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? "Could not update the schedule", "error")
        return
      }
      // Optimistic-feeling update without a full reload: flip the flag
      // locally, then revalidate quietly in the background.
      setRules((current) =>
        current.map((r) => (r.id === rule.id ? { ...r, is_active: r.is_active === 1 ? 0 : 1 } : r)),
      )
      toast(rule.is_active === 1 ? "Schedule paused" : "Schedule resumed", "success")
      loadRules()
    } catch {
      toast("Could not update the schedule", "error")
    } finally {
      setBusyId(null)
    }
  }

  async function deleteRule(rule: Rule) {
    setBusyId(rule.id)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/auto-reload?id=${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
        headers,
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? "Could not cancel the schedule", "error")
        return
      }
      setRules((current) => current.filter((r) => r.id !== rule.id))
      setConfirmDeleteId(null)
      toast("Scheduled payment cancelled", "success")
    } catch {
      toast("Could not cancel the schedule", "error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">Scheduled Payments</h1>
        <Link
          href="/dashboard/services/electricity"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New
        </Link>
      </div>

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={loadRules}
            className="mt-3 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Try again
          </button>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            You don&apos;t have any scheduled bill payments yet. Set one up from the electricity or data page.
          </p>
          <Link
            href="/dashboard/services/electricity"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Pay Electricity
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-secondary">
                    {serviceLabel(rule.service_type)} - {rule.network_or_biller}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rule.nickname ? `${rule.nickname} · ` : ""}
                    {rule.recipient}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    rule.is_active === 1
                      ? "bg-accent/15 text-accent dark:bg-accent/25"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {rule.is_active === 1 ? "Active" : "Paused"}
                </span>
              </div>

              <p className="text-sm text-secondary">
                {formatNaira(rule.amount_kobo)} · {rule.frequency}
              </p>
              <p className="text-xs text-muted-foreground">
                Next run: {new Date(rule.next_run_at).toLocaleString()}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === rule.id}
                  onClick={() => toggleActive(rule)}
                  className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-secondary hover:bg-muted disabled:opacity-50"
                >
                  {rule.is_active === 1 ? "Pause" : "Resume"}
                </button>
                {confirmDeleteId === rule.id ? (
                  <div className="flex flex-1 gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === rule.id}
                      onClick={() => deleteRule(rule)}
                      className="flex-1 rounded-md bg-destructive py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                    >
                      {busyId === rule.id ? "Cancelling…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === rule.id}
                    onClick={() => setConfirmDeleteId(rule.id)}
                    className="flex-1 rounded-md border border-destructive/40 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
