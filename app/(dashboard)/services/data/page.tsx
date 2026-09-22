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
// Validity-bucket tabs shown above the plan picker, same idea as
// Pairgate's own Daily/Weekly/Monthly/Yearly split. Buckets are
// derived purely from the validity already encoded in each group's
// plan_code (via the leading "<size>mb-<days>d" shape canonicalPlanKey
// produces) — no new data, no server change, just a client-side
// re-bucketing of what listPlanGroups already returns. "Hot Data"
// (Pairgate's default landing tab) isn't reproduced here since it's
// a provider-curated/promoted subset, not a validity bucket; every
// plan is reachable from exactly one of the four tabs below by its
// real validity, so nothing is hidden.
type ValidityBucket = "daily" | "weekly" | "monthly" | "yearly"
const BUCKET_LABELS: Record<ValidityBucket, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
}
const BUCKET_ORDER: ValidityBucket[] = ["daily", "weekly", "monthly", "yearly"]

// Pulls the validity-day count out of a group's own plan_code, the
// same "<size>mb-<days>d..." shape labelFromPlanCode already parses
// (and the "<family>-<days>d..." shape for named plan families like
// Collabo). Returns null when the code doesn't carry a parseable day
// count at all — those groups fall back to "daily" (see bucketFor)
// rather than being silently dropped from every tab.
function validityDaysFromPlanCode(code: string): number | null {
  const match = code.match(/-(\d+)d(?:-[a-z0-9_+]+)*$/i) ?? code.match(/^(?:\d+mb|[a-z][a-z0-9]*)-(\d+)d/i)
  if (!match) return null
  return parseInt(match[1], 10)
}

// Boundaries mirror common Nigerian VTU provider conventions (Pairgate
// included): 1-6 days = Daily, 7-27 = Weekly, 28-89 = Monthly, 90+ =
// Yearly. A 7-day plan reads as "Weekly" to a customer even though
// it's also "7 days", so the cut sits at 7, not "over 7".
function bucketFor(days: number | null): ValidityBucket {
  if (days === null) return "daily"
  if (days < 7) return "daily"
  if (days < 28) return "weekly"
  if (days < 90) return "monthly"
  return "yearly"
}

// Last-resort formatter for a plan_code that didn't match either
// canonical shape below (e.g. a stale pre-normalization row still
// pending the plan-code migration, or a label the normalizer
// genuinely couldn't parse confidently). Never shows the raw
// hyphenated slug verbatim — title-cases it into something readable
// instead, so "200-mb-14-days-sme" reads as "200 Mb 14 Days Sme"
// rather than exposing internal formatting to the customer.
function titleCaseFallback(code: string): string {
  return code
    .split("-")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" ")
}

function labelFromPlanCode(code: string): string {
  const match = code.match(/^(\d+)mb-(\d+)d((?:-[a-z_+]+)*)$/i)
  if (!match) return titleCaseFallback(code)
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
  const [bucket, setBucket] = useState<ValidityBucket>("daily")
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
    kind: "price" | "network"
    message: string
    planCode: string
    priceKobo: number
    detectedNetwork?: string | null
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
          // Land on whichever bucket actually has plans for this
          // network, preferring Daily when it does (matches habit —
          // daily plans are the most frequently bought) rather than
          // always defaulting to Daily and showing an empty tab.
          const firstNonEmpty =
            BUCKET_ORDER.find((b) =>
              loadedGroups.some((g) => bucketFor(validityDaysFromPlanCode(g.groupKey.split(":").pop() ?? g.groupKey)) === b),
            ) ?? "daily"
          setBucket(firstNonEmpty)
          const firstInBucket =
            loadedGroups.find(
              (g) => bucketFor(validityDaysFromPlanCode(g.groupKey.split(":").pop() ?? g.groupKey)) === firstNonEmpty,
            ) ?? loadedGroups[0]
          setGroupKey(firstInBucket.groupKey)
          setPlanCode(firstInBucket.variants[0].planCode)
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

  // groupKey is shaped "<network>:<base-plan-code>" (see
  // listPlanGroups/splitPlanCodeForGrouping in pricing.ts) — validity
  // lives in the part after the colon, so strip the network prefix
  // before parsing days out of it.
  function bucketOfGroup(g: PlanGroup): ValidityBucket {
    const codePart = g.groupKey.includes(":") ? g.groupKey.split(":").slice(1).join(":") : g.groupKey
    return bucketFor(validityDaysFromPlanCode(codePart))
  }
  const groupsInBucket = groups.filter((g) => bucketOfGroup(g) === bucket)

  const selectedGroup = groups.find((g) => g.groupKey === groupKey)
  const selectedVariant = selectedGroup?.variants.find((v) => v.planCode === planCode)

  const networkMismatch = phone.length > 0 && !matchesSelectedNetwork(phone, network)
  const detected = detectNetwork(phone)

  function selectGroup(g: PlanGroup) {
    setGroupKey(g.groupKey)
    setPlanCode(g.variants[0].planCode) // default to the cheapest variant in the group
    setConfirmState(null)
  }

  // Switching tabs re-picks groupKey/planCode from whatever's now
  // visible so the form never keeps a hidden-tab selection active
  // (which would let someone submit a plan they can no longer see).
  function selectBucket(b: ValidityBucket) {
    setBucket(b)
    const inBucket = groups.filter((g) => bucketOfGroup(g) === b)
    if (inBucket.length) selectGroup(inBucket[0])
    else { setGroupKey(""); setPlanCode(""); setConfirmState(null) }
  }

  async function submitPurchase(expectedPriceKobo: number | undefined, useplanCode: string, confirmNetworkMismatch: boolean) {
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
        confirmNetworkMismatch,
      }),
    })
    return res.json()
  }

  // Reads whatever confirmation gate the server just returned (price
  // change, plan unavailable, or network mismatch) and sets confirmState
  // accordingly. Returns true if a gate fired (caller should stop and
  // let the user act on it), false if the purchase actually went through
  // or failed for an unrelated reason.
  function handleGateResponse(data: any, fallbackPlanCode: string): boolean {
    if (data.requiresNetworkConfirmation) {
      setConfirmState({
        kind: "network",
        message: `This number looks like it's on ${data.detectedNetwork ?? "a different network"}, not ${network}. Data sent to the wrong network cannot be refunded.`,
        planCode: fallbackPlanCode,
        priceKobo: selectedVariant?.priceKobo ?? 0,
        detectedNetwork: data.detectedNetwork ?? null,
      })
      return true
    }
    if (data.requiresPriceConfirmation || data.planUnavailable) {
      setConfirmState({
        kind: "price",
        message: data.message,
        planCode: data.suggestedPlanCode ?? fallbackPlanCode,
        priceKobo: data.actualPriceKobo ?? data.suggestedPriceKobo,
      })
      return true
    }
    return false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setConfirmState(null)

    setLoading(true)
    const data = await submitPurchase(selectedVariant?.priceKobo, planCode, false)
    setLoading(false)

    if (handleGateResponse(data, planCode)) return

    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setPhone(""); setPin("") }
  }

  async function handleConfirm() {
    if (!confirmState) return
    setLoading(true)
    setResult(null)
    const data = await submitPurchase(
      confirmState.priceKobo,
      confirmState.planCode,
      confirmState.kind === "network",
    )
    setLoading(false)
    setConfirmState(null)

    if (handleGateResponse(data, confirmState.planCode)) return

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

      {confirmState && confirmState.kind === "network" && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
          <p className="mb-2 font-medium text-destructive">{confirmState.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "Processing..." : `Confirm and buy for ${network} anyway`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmState(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmState && confirmState.kind === "price" && (
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

          {!plansLoading && !plansError && groups.length > 0 && (
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {BUCKET_ORDER.map((b) => (
                <button
                  type="button"
                  key={b}
                  onClick={() => selectBucket(b)}
                  className={`rounded-md border py-1.5 text-xs font-medium ${bucket === b ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}
                >
                  {BUCKET_LABELS[b]}
                </button>
              ))}
            </div>
          )}

          {plansLoading ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">Loading plans…</div>
          ) : plansError ? (
            <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{plansError}</div>
          ) : groups.length === 0 ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
              No data plans are configured for {network} yet.
            </div>
          ) : groupsInBucket.length === 0 ? (
            <div className="w-full rounded-md border border-border px-3 py-2 text-sm text-secondary/60">
              No {BUCKET_LABELS[bucket].toLowerCase()} plans for {network} right now — try another tab.
            </div>
          ) : (
            <select value={groupKey} onChange={(e) => {
              const g = groupsInBucket.find((x) => x.groupKey === e.target.value)
              if (g) selectGroup(g)
            }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm">
              {groupsInBucket.map((g) => (
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

        <button type="submit" disabled={loading || !!confirmState || !planCode || !user?.hasTransactionPin}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Buy data"}
        </button>
      </form>
    </div>
  )
}
