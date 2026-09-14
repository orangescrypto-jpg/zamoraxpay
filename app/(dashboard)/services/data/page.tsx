// app/(dashboard)/services/data/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { detectNetwork, matchesSelectedNetwork, type NetworkName } from "@/lib/networkDetect"

const NETWORKS: NetworkName[] = ["MTN", "Airtel", "Glo", "9mobile"]

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
// (see src/services/planNormalization.ts) — e.g. "5000mb-1d-awoof",
// "500mb-7d", "1000mb-1d-social+binge". Category (gifting/awoof/cg/
// sme) is an internal routing detail and is dropped from the group
// label — it's shown separately as a sub-option instead (see
// CATEGORY_LABELS below), never silently hidden. Bundle tags
// (social/binge/youtube/night) ARE shown in the label — they mean a
// genuinely different, restricted product the customer should know
// about before buying. Size converts MB -> GB above 1000MB.
const BUNDLE_TAG_LABELS: Record<string, string> = {
  social: "Social",
  binge: "Binge",
  youtube: "YouTube",
  night: "Night",
}
const KNOWN_BUNDLE_TAGS = new Set(Object.keys(BUNDLE_TAG_LABELS))
const CATEGORY_LABELS: Record<string, string> = {
  standard: "Standard",
  gifting: "Gifting",
  awoof: "Awoof",
  cg: "CG",
  cg_lite: "CG Lite",
  sme: "SME",
  corporate: "Corporate",
  direct: "Direct",
}
function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}
function labelFromPlanCode(code: string): string {
  const match = code.match(/^(\d+)mb-(\d+)d((?:-[a-z_+]+)*)$/i)
  if (!match) return code
  const [, sizeMBStr, daysStr, suffixPart] = match
  const sizeMB = parseInt(sizeMBStr, 10)
  const days = parseInt(daysStr, 10)
  const sizeLabel =
    sizeMB >= 1000 && sizeMB % 1000 === 0
      ? `${sizeMB / 1000}GB`
      : sizeMB >= 1000
        ? `${(sizeMB / 1000).toFixed(1)}GB`
        : `${sizeMB}MB`
  const dayLabel = days === 1 ? "1 day" : `${days} days`
  // Suffix segments after size/validity are category (internal,
  // dropped here — shown as a sub-option instead) and/or bundle tags
  // (shown — a genuinely different, restricted product). A "+"-joined
  // segment is always bundle tags.
  const CATEGORY_KEYS = new Set(["gifting", "awoof", "cg", "cg_lite", "sme", "corporate", "direct", "standard"])
  const segments = suffixPart ? suffixPart.split("-").filter(Boolean) : []
  const bundleParts = segments.filter((s) => s.includes("+") || (KNOWN_BUNDLE_TAGS.has(s) && !CATEGORY_KEYS.has(s)))
  const bundleLabel = bundleParts.length
    ? " (" +
      bundleParts
        .flatMap((s) => s.split("+"))
        .map((t) => BUNDLE_TAG_LABELS[t] ?? t)
        .join(" + ") +
      ")"
    : ""
  return `${sizeLabel} - ${dayLabel}${bundleLabel}`
}

export default function DataPage() {
  const { user } = useAuth()
  const [network, setNetwork] = useState(NETWORKS[0])
  const [phone, setPhone] = useState("")
  // Pre-fill with the user's own registered number for the common case
  // (buying for self) — still a plain editable input, so switching to
  // someone else's number just means typing over it.
  useEffect(() => {
    if (user?.phone && phone === "") setPhone(user.phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone])
  const [groups, setGroups] = useState<PlanGroup[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [groupKey, setGroupKey] = useState("")
  const [planCode, setPlanCode] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  // Set when the backend reports the price changed or the picked plan
  // just went unavailable — holds what the customer needs to see and
  // explicitly accept before anything is charged. Nothing is charged
  // while this is set; submitting again with confirmedPriceKobo set
  // sends expectedPriceKobo matching the new price/plan, which lets it
  // through on the next attempt.
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
      setGroupKey("")
      setPlanCode("")
      setConfirmState(null)

      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        const res = await fetch(
          `/api/pricing?serviceType=data&networkOrBiller=${encodeURIComponent(network)}&grouped=1`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        )
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setPlansError(data.error ?? "Could not load data plans")
          setGroups([])
          return
        }

        const loadedGroups: PlanGroup[] = data.groups ?? []
        setGroups(loadedGroups)
        if (loadedGroups.length) {
          setGroupKey(loadedGroups[0].groupKey)
          setPlanCode(loadedGroups[0].variants[0].planCode)
        }
      } catch {
        if (!cancelled) setPlansError("Could not load data plans")
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    loadPlans()
    return () => { cancelled = true }
  }, [network])

  const selectedGroup = groups.find((g) => g.groupKey === groupKey)
  const selectedVariant = selectedGroup?.variants.find((v) => v.planCode === planCode)

  const networkMismatch = phone.length > 0 && !matchesSelectedNetwork(phone, network)
  const detected = detectNetwork(phone)

  function selectGroup(g: PlanGroup) {
    setGroupKey(g.groupKey)
    setPlanCode(g.variants[0].planCode) // default to the cheapest variant in the group
    setConfirmState(null)
  }

  async function submitPurchase(expectedPriceKobo: number | undefined, useplanCode: string) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        network,
        phone,
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

    if (networkMismatch) {
      const proceed = window.confirm(
        `This number looks like it's on ${detected}, not ${network}. Buy anyway?`,
      )
      if (!proceed) return
    }

    setLoading(true)
    const data = await submitPurchase(selectedVariant?.priceKobo, planCode)
    setLoading(false)

    // Price changed or the plan just went unavailable — show the
    // confirm step instead of an error. Nothing has been charged.
    if (data.requiresPriceConfirmation || data.planUnavailable) {
      setConfirmState({
        message: data.message,
        planCode: data.suggestedPlanCode ?? planCode,
        priceKobo: data.actualPriceKobo ?? data.suggestedPriceKobo,
      })
      return
    }

    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setPhone(""); setPin("") }
  }

  async function handleConfirm() {
    if (!confirmState) return
    setLoading(true)
    setResult(null)
    const data = await submitPurchase(confirmState.priceKobo, confirmState.planCode)
    setLoading(false)
    setConfirmState(null)

    if (data.requiresPriceConfirmation || data.planUnavailable) {
      // Changed again between confirm and resubmit — rare, but handle
      // it the same way rather than silently charging a third price.
      setConfirmState({
        message: data.message,
        planCode: data.suggestedPlanCode ?? confirmState.planCode,
        priceKobo: data.actualPriceKobo ?? data.suggestedPriceKobo,
      })
      return
    }

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
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-secondary">Phone number</label>
            {user?.phone && phone !== user.phone && (
              <button
                type="button"
                onClick={() => setPhone(user.phone!)}
                className="text-xs font-medium text-primary underline"
              >
                Use my number
              </button>
            )}
          </div>
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08012345678"
            className={`w-full rounded-md border px-3 py-2 text-sm ${networkMismatch ? "border-destructive" : "border-border"}`} />
          {user?.phone && phone === user.phone && (
            <p className="mt-1 text-xs text-muted-foreground">Buying for yourself. Edit the number above to buy for someone else.</p>
          )}
          {networkMismatch ? (
            <p className="mt-1 text-xs text-destructive">
              This looks like a {detected} number, but you selected {network}. Double-check before you pay.
            </p>
          ) : (
            phone.length >= 4 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {detected ? `Detected network: ${detected}` : "Network not recognized from this prefix. You can still proceed"}
              </p>
            )
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Data plan</label>
          {plansLoading ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">Loading plans…</div>
          ) : plansError ? (
            <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{plansError}</div>
          ) : groups.length === 0 ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
              No data plans are configured for {network} yet.
            </div>
          ) : (
            <select value={groupKey} onChange={(e) => {
              const g = groups.find((x) => x.groupKey === e.target.value)
              if (g) selectGroup(g)
            }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm">
              {groups.map((g) => (
                <option key={g.groupKey} value={g.groupKey}>
                  {labelFromPlanCode(g.variants[0].planCode)} - from {formatNaira(g.cheapestPriceKobo)}
                </option>
              ))}
            </select>
          )}

          {/* Category sub-options — only shown when a group actually has
              more than one variant. Selecting one changes the exact
              planCode that gets purchased/charged; it never happens
              automatically. */}
          {selectedGroup && selectedGroup.variants.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedGroup.variants.map((v) => (
                <button
                  type="button"
                  key={v.planCode}
                  onClick={() => { setPlanCode(v.planCode); setConfirmState(null) }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${planCode === v.planCode ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}
                >
                  {categoryLabel(v.category)} - {formatNaira(v.priceKobo)}
                </button>
              ))}
            </div>
          )}

          {selectedVariant && (
            <p className="mt-1 text-sm font-medium text-secondary">
              You'll pay {formatNaira(selectedVariant.priceKobo)}
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
