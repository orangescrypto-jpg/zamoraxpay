// app/(dashboard)/services/data/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { detectNetwork, matchesSelectedNetwork, type NetworkName } from "@/lib/networkDetect"

const NETWORKS: NetworkName[] = ["MTN", "Airtel", "Glo", "9mobile"]

interface Plan {
  planCode: string
  priceKobo: number
}

// Plan codes are admin-defined (e.g. "1GB_30D"), so we turn them into
// a readable label rather than keeping a second, separate label list
// in the frontend that could drift from what admin actually configured.
function labelFromPlanCode(code: string): string {
  const match = code.match(/^(\d+(?:\.\d+)?)(GB|MB)_(\d+)D$/i)
  if (!match) return code
  const [, size, unit, days] = match
  return `${size}${unit.toUpperCase()} - ${days} days`
}

export default function DataPage() {
  const { user } = useAuth()
  const [network, setNetwork] = useState(NETWORKS[0])
  const [phone, setPhone] = useState("")
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
          `/api/pricing?serviceType=data&networkOrBiller=${encodeURIComponent(network)}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        )
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

  const selectedPlan = plans.find((p) => p.planCode === planCode)

  const networkMismatch = phone.length > 0 && !matchesSelectedNetwork(phone, network)
  const detected = detectNetwork(phone)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    if (networkMismatch) {
      const proceed = window.confirm(
        `This number looks like it's on ${detected}, not ${network}. Buy anyway?`,
      )
      if (!proceed) return
    }

    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ network, phone, planCode, transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setPhone(""); setPin("") }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Buy Data</h1>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="mb-1 block text-sm font-medium text-secondary">Phone number</label>
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678"
            className={`w-full rounded-md border px-3 py-2 text-sm ${networkMismatch ? "border-destructive" : "border-border"}`} />
          {networkMismatch && (
            <p className="mt-1 text-xs text-destructive">
              This looks like a {detected} number, but you selected {network}. Double-check before you pay.
            </p>
          )}
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
          {selectedPlan && (
            <p className="mt-1 text-sm font-medium text-secondary">
              You'll pay {formatNaira(selectedPlan.priceKobo)}
            </p>
          )}
        </div>

        {user && !user.hasTransactionPin ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            You need to set a transaction PIN before you can buy data.{" "}
            <Link href="/settings" className="font-medium underline">
              Set your PIN in Settings
            </Link>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
            <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
          </div>
        )}

        <button type="submit" disabled={loading || !planCode || !user?.hasTransactionPin}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Buy data"}
        </button>
      </form>
    </div>
  )
}
