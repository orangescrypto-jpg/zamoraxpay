// app/(admin)/admin/fraud/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatDate } from "@/lib/utils"

interface FraudFlag {
  id: string
  user_id: string
  full_name: string
  phone: string
  reason: string
  status: string
  notes: string | null
  created_at: string
}

export default function AdminFraudPage() {
  const [flags, setFlags] = useState<FraudFlag[]>([])
  const [statusFilter, setStatusFilter] = useState("open")
  const [loading, setLoading] = useState(true)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/fraud?status=${statusFilter}`, { headers })
    const data = await res.json()
    setFlags(data.flags ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function resolve(flagId: string, status: string, freezeWallet: boolean) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/fraud", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ flagId, status, freezeWallet }),
    })
    load()
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Fraud &amp; Reversals</h1>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="wallet_frozen">Wallet Frozen</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : flags.length === 0 ? (
        <p className="text-muted-foreground">No flags with this status.</p>
      ) : (
        <div className="max-w-3xl space-y-3">
          {flags.map((flag) => (
            <div key={flag.id} className="rounded-lg border border-border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary">{flag.full_name} · {flag.phone}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(flag.created_at)}</p>
                </div>
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {flag.reason.replace(/_/g, " ")}
                </span>
              </div>
              {flag.notes && <p className="mb-3 text-sm text-muted-foreground">{flag.notes}</p>}

              {flag.status === "open" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => resolve(flag.id, "wallet_frozen", true)}
                    className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Freeze wallet
                  </button>
                  <button
                    onClick={() => resolve(flag.id, "reviewed", false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Mark reviewed
                  </button>
                  <button
                    onClick={() => resolve(flag.id, "dismissed", false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
