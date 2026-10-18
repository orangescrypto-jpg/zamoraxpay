// app/(dashboard)/beneficiaries/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface Beneficiary {
  id: string
  service_type: string
  network_or_biller: string
  recipient: string
  nickname: string | null
}

export default function BeneficiariesPage() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/beneficiaries", { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Could not load saved beneficiaries.")
      setBeneficiaries(Array.isArray(data.beneficiaries) ? data.beneficiaries : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved beneficiaries.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    if (removingId) return
    setRemovingId(id)
    setError(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/beneficiaries?id=${encodeURIComponent(id)}`, { method: "DELETE", headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Could not remove this beneficiary.")
      setBeneficiaries((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this beneficiary.")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="container max-w-2xl py-6 sm:py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Saved Beneficiaries</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Numbers you save during a purchase appear here for one-tap repeat orders.
      </p>

      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="space-y-3" aria-label="Loading beneficiaries">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : beneficiaries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center"><p className="font-medium text-secondary">No saved beneficiaries yet</p><p className="mt-1 text-sm text-muted-foreground">Save a recipient during a purchase to make repeat orders easier.</p></div>
      ) : (
        <div className="space-y-2">
          {beneficiaries.map((b) => (
            <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-secondary">{b.nickname || b.recipient}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {b.service_type.replace("_", " ")} · {b.network_or_biller} · {b.recipient}
                </p>
              </div>
              <button type="button" onClick={() => handleDelete(b.id)} disabled={removingId !== null} className="self-start rounded-lg border border-border px-3 py-1.5 text-sm text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto">
                {removingId === b.id ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
