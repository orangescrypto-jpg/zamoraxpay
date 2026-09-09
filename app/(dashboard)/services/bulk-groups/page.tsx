// app/(dashboard)/services/bulk-groups/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"

interface BatchSummary {
  id: string
  name: string
  numberCount: number
  createdAt: string
}

export default function SavedGroupsPage() {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/contact-batches", { headers })
    const data = await res.json()
    setBatches(data.batches ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    const headers = await getAuthHeader()
    await fetch(`/api/contact-batches?id=${encodeURIComponent(id)}`, { method: "DELETE", headers })
    setDeletingId(null)
    load()
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">My Saved Groups</h1>
        <Link href="/services/bulk-groups/new" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          + New Group
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : batches.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            You need to create a contact batch before making a bulk purchase.
          </p>
          <Link href="/services/bulk-groups/new" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            + Create Contact Batch
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <div key={b.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-secondary">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.numberCount} number{b.numberCount === 1 ? "" : "s"}</p>
                </div>
              </div>

              {deletingId === b.id ? (
                <div className="flex items-center gap-2 border-t border-border pt-3 text-xs">
                  <span className="text-destructive">Delete this group?</span>
                  <button onClick={() => handleDelete(b.id)} className="rounded-md bg-destructive px-2 py-1 font-medium text-white">
                    Yes
                  </button>
                  <button onClick={() => setDeletingId(null)} className="rounded-md border border-border px-2 py-1 font-medium text-secondary">
                    No
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs font-medium">
                  <Link href={`/services/bulk-data?batchId=${b.id}`} className="text-primary hover:underline">
                    Buy Data
                  </Link>
                  <Link href={`/services/bulk-airtime?batchId=${b.id}`} className="text-primary hover:underline">
                    Buy Airtime
                  </Link>
                  <button onClick={() => setDeletingId(b.id)} className="text-destructive hover:underline">
                    Delete
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
