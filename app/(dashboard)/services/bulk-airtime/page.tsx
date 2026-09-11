// app/(dashboard)/services/bulk-airtime/page.tsx
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface BatchSummary {
  id: string
  name: string
  numberCount: number
  createdAt: string
}

interface BulkItemResult {
  phone: string
  detectedNetwork: string | null
  success: boolean
  message: string
  chargedKobo?: number
}

interface BulkResult {
  success: boolean
  message?: string
  successCount: number
  failureCount: number
  totalChargedKobo: number
  items: BulkItemResult[]
}

function BulkAirtimeForm() {
  const searchParams = useSearchParams()
  const preselectedBatchId = searchParams.get("batchId")

  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchId, setBatchId] = useState(preselectedBatchId ?? "")
  const [amountNaira, setAmountNaira] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  useEffect(() => {
    async function loadBatches() {
      const headers = await getAuthHeader()
      const res = await fetch("/api/contact-batches", { headers })
      const data = await res.json()
      setBatches(data.batches ?? [])
      setBatchesLoading(false)
      if (!preselectedBatchId && data.batches?.length) setBatchId(data.batches[0].id)
    }
    loadBatches()
  }, [preselectedBatchId])

  const selectedBatch = batches.find((b) => b.id === batchId)
  const amountKobo = Math.round((parseFloat(amountNaira) || 0) * 100)
  const totalEstimateKobo = selectedBatch ? amountKobo * selectedBatch.numberCount : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setError(null)
    setLoading(true)

    const headers = await getAuthHeader()
    const res = await fetch("/api/vtu/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ serviceType: "airtime", batchId, amountKobo, transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok && !data.items) {
      setError(data.error ?? data.message ?? "Bulk purchase failed")
      return
    }

    setResult(data)
    if (data.success) setPin("")
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Bulk Airtime</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Send the same airtime amount to everyone in a saved group.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="mb-4 space-y-2 rounded-md border border-border p-4">
          <p className="text-sm font-semibold text-secondary">
            {result.successCount} succeeded, {result.failureCount} failed — {formatNaira(result.totalChargedKobo)} total charged
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {result.items.map((item, i) => (
              <div key={i} className={`flex items-center justify-between rounded px-2 py-1 ${item.success ? "bg-accent/5" : "bg-destructive/5"}`}>
                <span className="font-mono">{item.phone}</span>
                <span className={item.success ? "text-accent" : "text-destructive"}>
                  {item.success ? formatNaira(item.chargedKobo ?? 0) : item.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {batchesLoading ? (
        <p className="text-muted-foreground">Loading groups...</p>
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Group</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm">
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.numberCount} numbers)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Amount per number (₦)</label>
            <input required type="number" min={50} value={amountNaira} onChange={(e) => setAmountNaira(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">Minimum airtime purchase is ₦50 per number.</p>
            {selectedBatch && amountKobo > 0 && (
              <p className="mt-1 text-sm font-medium text-secondary">
                {formatNaira(amountKobo)} × {selectedBatch.numberCount} = You'll pay {formatNaira(totalEstimateKobo)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
            <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
          </div>

          <button type="submit" disabled={loading || !batchId || amountKobo <= 0}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Processing..." : "Send Bulk Airtime"}
          </button>
        </form>
      )}
    </div>
  )
}

export default function BulkAirtimePage() {
  return (
    <Suspense fallback={<div className="container max-w-md py-8 text-muted-foreground">Loading...</div>}>
      <BulkAirtimeForm />
    </Suspense>
  )
}
