// app/(dashboard)/dashboard/services/bulk-data/page.tsx
"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import { useAuthCachedFetch } from "@/hooks/useCachedFetch"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { ResultBanner } from "@/components/ui/result-banner"
import { detectNetwork } from "@/lib/networkDetect"

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"]

interface BatchSummary {
  id: string
  name: string
  numberCount: number
  createdAt: string
}

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

// Same plan-code-to-label logic as the single data page — kept in
// sync manually since there's no shared util file for it yet. Plan
// codes are the canonical keys from canonicalPlanKey() (e.g.
// "5000mb-1d-awoof", "1000mb-1d-social+binge"). Category is shown as
// a separate sub-option (see CATEGORY_LABELS below), never silently
// dropped or auto-picked; bundle tags (social/binge/youtube/night)
// stay in the group label — a genuinely different, restricted product.
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

function BulkDataForm() {
  const searchParams = useSearchParams()
  const preselectedBatchId = searchParams.get("batchId")

  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchId, setBatchId] = useState(preselectedBatchId ?? "")
  const [network, setNetwork] = useState(NETWORKS[0])
  // Per-number network detection for the selected group, so the price
  // estimate reflects only numbers that will actually match the chosen
  // network — the server skips mismatches, but previously the shown
  // estimate assumed every number in the group would be charged.
  const [batchPhones, setBatchPhones] = useState<string[]>([])
  const [batchPhonesLoading, setBatchPhonesLoading] = useState(false)
  // PERF FIX: plan loading now goes through useAuthCachedFetch (shares
  // the same per-network cache key family as the single-purchase data
  // page, so switching between the two pages renders instantly) — 60s
  // TTL matching the API's private max-age, instead of a fresh fetch
  // on every mount/network change.
  const plansUrl = `/api/pricing?serviceType=data&networkOrBiller=${encodeURIComponent(network)}&grouped=1`
  const {
    data: plansData,
    loading: plansLoading,
    error: plansError,
  } = useAuthCachedFetch<{ groups: PlanGroup[] }>(plansUrl, {
    storageKey: `pricing:data:${network.toLowerCase()}`,
    storageVersion: 2,
    ttlMs: 60_000,
    fallback: { groups: [] },
    transform: (raw) => ({ groups: (raw as { groups?: PlanGroup[] }).groups ?? [] }),
  })
  const groups = useMemo(() => plansData.groups, [plansData])
  const [groupKey, setGroupKey] = useState("")
  const [planCode, setPlanCode] = useState("")
  // Type (category) is its own dropdown selected before the plan,
  // mirroring the single-purchase Data page's Type -> Plan flow. This
  // is what fixes the label/price mismatch bug: on the single page,
  // every Plan dropdown option's text is built from THAT option's own
  // variant (planCode + priceKobo) in the same expression, so the text
  // can never drift from what's actually selected. The old bulk-data
  // dropdown instead showed one static label per group (drawn from
  // group.variants[0] / group.cheapestPriceKobo) while a separate set
  // of category buttons silently changed the real selected planCode
  // underneath — the group-level label never updated to match, so it
  // could show a cheaper variant's price while a pricier one (or any
  // one picked via the buttons) was what would actually be charged.
  const [category, setCategory] = useState("")
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

  // Load the selected group's actual phone numbers whenever it changes,
  // so we can detect each one's network client-side and know how many
  // will really be charged under the currently selected network.
  useEffect(() => {
    if (!batchId) {
      setBatchPhones([])
      return
    }
    let cancelled = false
    async function loadBatchNumbers() {
      setBatchPhonesLoading(true)
      const headers = await getAuthHeader()
      const res = await fetch(`/api/contact-batches/${batchId}`, { headers })
      const data = await res.json()
      if (!cancelled) {
        setBatchPhones((data.batch?.numbers ?? []).map((n: { phone: string }) => n.phone))
        setBatchPhonesLoading(false)
      }
    }
    loadBatchNumbers()
    return () => {
      cancelled = true
    }
  }, [batchId])

  // How many of the group's saved numbers actually match the currently
  // selected network — mismatches get skipped server-side, so this is
  // the real count that will be charged, not the group's total size.
  const matchingCount = useMemo(
    () => batchPhones.filter((p) => detectNetwork(p) === network).length,
    [batchPhones, network],
  )


  // Keep groupKey/planCode valid whenever the (possibly cached) group
  // list changes. useAuthCachedFetch renders a cached `groups` array
  // immediately, then swaps in a freshly revalidated one — a new array
  // reference even when nothing actually changed, and sometimes one
  // where a previously-selected group or variant no longer exists (a
  // plan was repriced, reordered, or disabled). Re-deriving selection
  // from the CURRENT groups on every change, instead of only picking
  // defaults when nothing was selected yet, prevents `groupKey`/
  // `planCode` from pointing at a stale variant that happens to still
  // resolve (via .find()) to a different plan in the new array — which
  // is what caused the dropdown's label/price (always drawn fresh from
  // `groups`) to show one group's "from" price while the actual
  // selected plan underneath was a different, more expensive variant.
  useEffect(() => {
    if (!groups.length) {
      setGroupKey("")
      setPlanCode("")
      return
    }
    const stillValidGroup = groups.find((g) => g.groupKey === groupKey)
    if (!stillValidGroup) {
      setGroupKey(groups[0].groupKey)
      setPlanCode(groups[0].variants[0].planCode)
      return
    }
    const stillValidPlan = stillValidGroup.variants.some((v) => v.planCode === planCode)
    if (!stillValidPlan) {
      setPlanCode(stillValidGroup.variants[0].planCode)
    }
    // groupKey/planCode intentionally excluded: they're read here to
    // validate against the latest `groups`, not to re-trigger this
    // effect on every manual selection (selectGroup/setPlanCode already
    // set consistent state themselves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  const selectedBatch = batches.find((b) => b.id === batchId)
  const selectedGroup = groups.find((g) => g.groupKey === groupKey)
  const selectedPlan = selectedGroup?.variants.find((v) => v.planCode === planCode)
  const skippedCount = batchPhones.length - matchingCount
  const totalEstimateKobo = selectedPlan ? selectedPlan.priceKobo * matchingCount : 0

  function selectGroup(g: PlanGroup) {
    setGroupKey(g.groupKey)
    setPlanCode(g.variants[0].planCode) // default to the cheapest variant in the group
  }

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
        Send the same data plan to everyone in a saved group. All numbers must be on the selected network. Numbers detected on a different network are skipped.
      </p>

      {error && (
        <ResultBanner
          className="mb-4"
          variant="error"
          title="Error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {result && (
        <div className="mb-4 space-y-2">
          <ResultBanner
            variant={result.failureCount === 0 ? "success" : result.successCount === 0 ? "error" : "warning"}
            title={result.failureCount === 0 ? "All succeeded" : result.successCount === 0 ? "All failed" : "Partial success"}
            message={`${result.successCount} succeeded, ${result.failureCount} failed. ${formatNaira(result.totalChargedKobo)} total charged`}
            onDismiss={() => setResult(null)}
          />
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-secondary dark:text-foreground sr-only">
            {result.successCount} succeeded, {result.failureCount} failed. {formatNaira(result.totalChargedKobo)} total charged
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
        </div>
      )}

      {batchesLoading ? (
        <p className="text-muted-foreground">Loading groups...</p>
      ) : batches.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            You need to create a contact batch before making a bulk purchase.
          </p>
          <Link href="/dashboard/services/bulk-groups/new" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
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
                    {labelFromPlanCode(g.variants[0].planCode)}
                    {g.variants.length > 1
                      ? ` - from ${formatNaira(g.cheapestPriceKobo)}`
                      : ` - ${formatNaira(g.variants[0].priceKobo)}`}
                  </option>
                ))}
              </select>
            )}

            {/* Category sub-options — only shown when a group has more
                than one variant. Selecting one changes the exact
                planCode sent for the whole batch; never picked
                automatically. */}
            {selectedGroup && selectedGroup.variants.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedGroup.variants.map((v) => (
                  <button
                    type="button"
                    key={v.planCode}
                    onClick={() => setPlanCode(v.planCode)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${planCode === v.planCode ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}
                  >
                    {categoryLabel(v.category)} - {formatNaira(v.priceKobo)}
                  </button>
                ))}
              </div>
            )}

            {selectedPlan && selectedBatch && (
              <>
                {batchPhonesLoading ? (
                  <p className="mt-1 text-sm text-secondary/60">Checking numbers against {network}...</p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-secondary">
                    {formatNaira(selectedPlan.priceKobo)} × {matchingCount} {network} number{matchingCount === 1 ? "" : "s"} = You'll pay up to {formatNaira(totalEstimateKobo)}
                  </p>
                )}
                {!batchPhonesLoading && skippedCount > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {skippedCount} of {selectedBatch.numberCount} number{selectedBatch.numberCount === 1 ? "" : "s"} in this group {skippedCount === 1 ? "isn't" : "aren't"} on {network} and will be skipped.
                  </p>
                )}
                {!batchPhonesLoading && matchingCount === 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    None of the numbers in this group are on {network}. Choose a different network or group.
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
            <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
          </div>

          <button type="submit" disabled={loading || !batchId || !planCode || batchPhonesLoading || matchingCount === 0}
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
