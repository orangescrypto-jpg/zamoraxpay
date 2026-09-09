// app/(dashboard)/services/bulk-data/page.tsx
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"]

interface BatchSummary {
  id: string
  name: string
  numberCount: number
  createdAt: string
}

interface Plan {
  planCode: string
  priceKobo: number
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

// Same plan-code-to-label heuristic as the single data page — kept in
// sync manually since there's no shared util file for it yet.
function labelFromPlanCode(code: string): string {
  const match = code.match(/^(\d+(?:\.\d+)?)(GB|MB)_(\d+)D$/i)
  if (!match) return code
  const [, size, unit, days] = match
  return `${size}${unit.toUpperCase()} - ${days} days`
}

function BulkDataForm() {
  const searchParams = useSearchParams()
  const preselectedBatchId = searchParams.get("batchId")

  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchId, setBatchId] = useState(preselectedBatchId ?? "")
  const [network, setNetwork] = useState(NETWORKS[0])
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [planCode, setPlanCode] = useState("")
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

  useEffect(() => {
    let cancelled = false

    async function loadPlans() {
      setPlansLoading(true)
      setPlansError(null)
      setPlanCode("")

      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/pricing?serviceType=data&networkOrBiller=${encodeURIComponent(network)}`, { headers })
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setPlansError(data.error ?? "Could not load data plans")
          setPlans([])
          return
        }
        setPlans(data.plans ?? [])
        if (data.plans?.length) setPlanCode(data.plans[0].planCode)
      } catch {
        if (!cancelled) setPlansError("Could not load data plans")
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    loadPlans()
    return () => { cancelled = true }
  }, [network])

  const selectedBatch = batches.find((b) => b.id === batchId)
  const selectedPlan = plans.find((p) => p.planCode === planCode)
  const totalEstimateKobo = selectedBatch && selectedPlan ? selectedPlan.priceKobo * selectedBatch.numberCount : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setError(null)
    setLoading(true)

    const headers = await getAuthHeader()
    const res = await fetch("/api/vtu/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ serviceType: "data", batchId, network, planCode, transactionPin: pin }),
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
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Bulk Data</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Send the same data plan to everyone in a saved group. All numbers must be on the selected network — numbers detected on a different network are skipped.
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
            <label className="mb-1 block text-sm font-medium text-secondary">Network</label>
            <div className="grid grid-cols-4 gap-2">
              {NETWORKS.map((n) => (
                <button type="button" key={n} onClick={() => setNetwork(n)}
                  className={`rounded-md border py-2 text-sm font-medium ${network === n ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Data plan</label>
            {plansLoading ? (
              <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">Loading plans…</div>
            ) : plansError ? (
              <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{plansError}</div>
            ) : plans.length === 0 ? (
              <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
                No data plans are configured for {network} yet.
              </div>
            ) : (
              <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm">
                {plans.map((p) => (
                  <option key={p.planCode} value={p.planCode}>
                    {labelFromPlanCode(p.planCode)} — {formatNaira(p.priceKobo)}
                  </option>
                ))}
              </select>
            )}
            {selectedPlan && selectedBatch && (
              <p className="mt-1 text-sm font-medium text-secondary">
                {formatNaira(selectedPlan.priceKobo)} × {selectedBatch.numberCount} = You'll pay up to {formatNaira(totalEstimateKobo)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
            <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
          </div>

          <button type="submit" disabled={loading || !batchId || !planCode}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? "Processing..." : "Send Bulk Data"}
          </button>
        </form>
      )}
    </div>
  )
}

export default function BulkDataPage() {
  return (
    <Suspense fallback={<div className="container max-w-md py-8 text-muted-foreground">Loading...</div>}>
      <BulkDataForm />
    </Suspense>
  )
}
