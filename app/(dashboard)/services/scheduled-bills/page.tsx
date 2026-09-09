// app/(dashboard)/services/scheduled-bills/page.tsx
// Lists every auto-reload rule (electricity, data, etc.) so the user can
// pause/resume or cancel a scheduled payment. Reuses the existing
// /api/auto-reload endpoints — this is a UI on top of infrastructure
// that already supported any serviceType, it just had no screen yet.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
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
  return serviceType
}

export default function ScheduledBillsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadRules() {
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
  }

  useEffect(() => {
    loadRules()
  }, [])

  async function toggleActive(rule: Rule) {
    setBusyId(rule.id)
    try {
      const headers = await getAuthHeader()
      await fetch("/api/auto-reload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id: rule.id, isActive: rule.is_active !== 1 }),
      })
      await loadRules()
    } finally {
      setBusyId(null)
    }
  }

  async function deleteRule(rule: Rule) {
    if (!window.confirm("Cancel this scheduled payment? This can't be undone.")) return
    setBusyId(rule.id)
    try {
      const headers = await getAuthHeader()
      await fetch(`/api/auto-reload?id=${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
        headers,
      })
      await loadRules()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">Scheduled Payments</h1>
        <Link
          href="/services/electricity"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            You don't have any scheduled bill payments yet. Set one up from the electricity or data page.
          </p>
          <Link
            href="/services/electricity"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Pay Electricity
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-secondary">
                    {serviceLabel(rule.service_type)} — {rule.network_or_biller}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rule.nickname ? `${rule.nickname} · ` : ""}
                    {rule.recipient}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    rule.is_active === 1
                      ? "bg-accent/10 text-accent"
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
                  className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-secondary disabled:opacity-50"
                >
                  {rule.is_active === 1 ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  disabled={busyId === rule.id}
                  onClick={() => deleteRule(rule)}
                  className="flex-1 rounded-md border border-destructive/40 py-1.5 text-xs font-medium text-destructive disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
