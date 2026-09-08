// app/(dashboard)/services/cable/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const BILLERS = ["DSTV", "GOtv", "StarTimes"]

interface Plan {
  planCode: string
  priceKobo: number
}

// Plan codes are admin-defined (e.g. "DSTV_COMPACT_PLUS"); turn the
// biller prefix + underscores into a readable label instead of
// keeping a second, separate label list that can drift from admin.
function labelFromPlanCode(code: string, biller: string): string {
  const prefix = biller.toUpperCase().replace(/\s/g, "")
  const rest = code.startsWith(prefix + "_") ? code.slice(prefix.length + 1) : code
  const words = rest.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase())
  return `${biller} ${words.join(" ")}`
}

export default function CablePage() {
  const [biller, setBiller] = useState(BILLERS[0])
  const [smartcardNumber, setSmartcardNumber] = useState("")
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [planCode, setPlanCode] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPlans() {
      setPlansLoading(true)
      setPlansError(null)
      setPlanCode("")

      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        const res = await fetch(
          `/api/pricing?serviceType=cable&networkOrBiller=${encodeURIComponent(biller)}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        )
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setPlansError(data.error ?? "Could not load packages")
          setPlans([])
          return
        }

        setPlans(data.plans ?? [])
        if (data.plans?.length) setPlanCode(data.plans[0].planCode)
      } catch {
        if (!cancelled) setPlansError("Could not load packages")
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    loadPlans()
    return () => { cancelled = true }
  }, [biller])

  const selectedPlan = plans.find((p) => p.planCode === planCode)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/cable", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ biller, smartcardNumber, planCode, transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setSmartcardNumber(""); setPin("") }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Pay Cable TV</h1>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {BILLERS.map((b) => (
              <button type="button" key={b} onClick={() => setBiller(b)}
                className={`rounded-md border py-2 text-sm font-medium ${biller === b ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Smartcard / IUC number</label>
          <input required value={smartcardNumber} onChange={(e) => setSmartcardNumber(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Package</label>
          {plansLoading ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">Loading packages…</div>
          ) : plansError ? (
            <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{plansError}</div>
          ) : plans.length === 0 ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
              No packages are configured for {biller} yet.
            </div>
          ) : (
            <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm">
              {plans.map((p) => (
                <option key={p.planCode} value={p.planCode}>
                  {labelFromPlanCode(p.planCode, biller)} — {formatNaira(p.priceKobo)}
                </option>
              ))}
            </select>
          )}
          {selectedPlan && (
            <p className="mt-1 text-sm font-medium text-secondary">
              You'll pay {formatNaira(selectedPlan.priceKobo)}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
          <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
        </div>

        <button type="submit" disabled={loading || !planCode}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Pay subscription"}
        </button>
      </form>
    </div>
  )
}
