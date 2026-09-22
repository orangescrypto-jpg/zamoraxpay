// app/(dashboard)/services/cable/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const BILLERS = ["DSTV", "GOtv", "StarTimes"]

interface PlanVariant {
  planCode: string
  category: string
  priceKobo: number
}

interface PlanGroup {
  groupKey: string
  cheapestPriceKobo: number
  variants: PlanVariant[]
}

// Plan codes are the canonical keys produced by canonicalPlanKey()
// (see src/services/planNormalization.ts): a recognized tier
// ("compact-plus", "super-antenna") or a recognized add-on
// ("addon-french-11", "addon-movie-bundle"), each with an optional
// trailing "-<N>d" validity suffix. Formats those into a readable
// label. A plan_code that matches neither shape is a genuine
// low-confidence row (an unrecognized provider-internal code like
// "dstv79", or a stale pre-normalization row pending the plan-code
// migration) — title-cased instead of shown as a raw slug, same
// fallback principle as the data page's labelFromPlanCode.
function titleCaseFallback(code: string): string {
  return code
    .split("-")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" ")
}

function labelFromPlanCode(code: string, biller: string): string {
  const match = code.match(/^(addon-)?([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(\d+)d)?$/i)
  if (!match) return `${biller} ${titleCaseFallback(code)}`
  const [, addonPrefix, base, daysStr] = match
  const words = base.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  const validitySuffix = daysStr ? ` (${daysStr} days)` : ""
  return addonPrefix
    ? `${biller} ${words.join(" ")} Add-on${validitySuffix}`
    : `${biller} ${words.join(" ")}${validitySuffix}`
}

export default function CablePage() {
  const [biller, setBiller] = useState(BILLERS[0])
  const [smartcardNumber, setSmartcardNumber] = useState("")
  // Cable plan_codes have no category variants (see pricing.ts
  // listPlanGroups — cable's canonical code has no category suffix),
  // so every group here has exactly one variant. Grouped API is still
  // used so cable gets the same price-confirmation and plan-
  // unavailable safety net as data, without needing separate logic.
  const [groups, setGroups] = useState<PlanGroup[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [planCode, setPlanCode] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [confirmState, setConfirmState] = useState<{
    message: string
    planCode: string
    priceKobo: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPlans() {
      setPlansLoading(true)
      setPlansError(null)
      setPlanCode("")
      setConfirmState(null)

      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        const res = await fetch(
          `/api/pricing?serviceType=cable&networkOrBiller=${encodeURIComponent(biller)}&grouped=1`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        )
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setPlansError(data.error ?? "Could not load packages")
          setGroups([])
          return
        }

        const loadedGroups: PlanGroup[] = data.groups ?? []
        setGroups(loadedGroups)
        if (loadedGroups.length) setPlanCode(loadedGroups[0].variants[0].planCode)
      } catch {
        if (!cancelled) setPlansError("Could not load packages")
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    loadPlans()
    return () => { cancelled = true }
  }, [biller])

  const allVariants = groups.flatMap((g) => g.variants)
  const selectedPlan = allVariants.find((p) => p.planCode === planCode)

  async function submitPurchase(expectedPriceKobo: number | undefined, useplanCode: string) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/cable", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        biller,
        smartcardNumber,
        planCode: useplanCode,
        transactionPin: pin,
        expectedPriceKobo,
      }),
    })
    return res.json()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setConfirmState(null)
    setLoading(true)

    const data = await submitPurchase(selectedPlan?.priceKobo, planCode)
    setLoading(false)

    if (data.requiresPriceConfirmation || data.planUnavailable) {
      setConfirmState({
        message: data.message,
        planCode: data.suggestedPlanCode ?? planCode,
        priceKobo: data.actualPriceKobo ?? data.suggestedPriceKobo,
      })
      return
    }

    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setSmartcardNumber(""); setPin("") }
  }

  async function handleConfirm() {
    if (!confirmState) return
    setLoading(true)
    setResult(null)
    const data = await submitPurchase(confirmState.priceKobo, confirmState.planCode)
    setLoading(false)
    setConfirmState(null)

    if (data.requiresPriceConfirmation || data.planUnavailable) {
      setConfirmState({
        message: data.message,
        planCode: data.suggestedPlanCode ?? confirmState.planCode,
        priceKobo: data.actualPriceKobo ?? data.suggestedPriceKobo,
      })
      return
    }

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

      {confirmState && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-2">{confirmState.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Processing..." : `Confirm ${formatNaira(confirmState.priceKobo)}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmState(null)}
              className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900"
            >
              Cancel
            </button>
          </div>
        </div>
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
          ) : allVariants.length === 0 ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
              No packages are configured for {biller} yet.
            </div>
          ) : (
            <select value={planCode} onChange={(e) => { setPlanCode(e.target.value); setConfirmState(null) }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm">
              {allVariants.map((p) => (
                <option key={p.planCode} value={p.planCode}>
                  {labelFromPlanCode(p.planCode, biller)} - {formatNaira(p.priceKobo)}
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
