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

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/beneficiaries", { headers })
    const data = await res.json()
    setBeneficiaries(data.beneficiaries ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    const headers = await getAuthHeader()
    await fetch(`/api/beneficiaries?id=${id}`, { method: "DELETE", headers })
    load()
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Saved Beneficiaries</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Numbers you save during a purchase appear here for one-tap repeat orders.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : beneficiaries.length === 0 ? (
        <p className="text-muted-foreground">No saved beneficiaries yet.</p>
      ) : (
        <div className="space-y-2">
          {beneficiaries.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium text-secondary">{b.nickname || b.recipient}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {b.service_type.replace("_", " ")} · {b.network_or_biller} · {b.recipient}
                </p>
              </div>
              <button onClick={() => handleDelete(b.id)} className="text-sm text-destructive hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
