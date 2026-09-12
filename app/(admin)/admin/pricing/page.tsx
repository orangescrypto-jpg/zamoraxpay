// app/(admin)/admin/pricing/page.tsx
"use client"

import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface PricingRule {
  id: string
  service_type: string
  network_or_biller: string
  plan_code: string | null
  retail_price_kobo: number
  wholesale_price_kobo: number
  convenience_fee_kobo: number
}

const SERVICE_TYPES = ["airtime", "data", "cable", "electricity", "exam_pin", "epin", "betting"]

// Must exactly match the network/biller values each buy-flow page sends
// (see app/(dashboard)/services/*/page.tsx). Pricing lookups are an exact
// string match, so this list — not free text — is what prevents rules
// silently never matching (e.g. "GLO" saved in admin vs "Glo" sent by
// the buy-data page).
const NETWORKS_OR_BILLERS: Record<string, string[]> = {
  airtime: ["MTN", "Airtel", "Glo", "9mobile"],
  data: ["MTN", "Airtel", "Glo", "9mobile"],
  cable: ["DSTV", "GOtv", "StarTimes"],
  electricity: ["IKEDC", "EKEDC", "AEDC", "PHEDC", "IBEDC", "KEDCO"],
  exam_pin: ["WAEC", "NECO", "JAMB", "NABTEB"],
  epin: ["MTN", "Airtel", "Glo", "9mobile"],
  betting: ["Bet9ja", "SportyBet", "NairaBet", "BetKing", "1xBet"],
}

// Some services have a fixed, small set of valid plan_code values
// rather than admin-free-text plan codes (like data bundle codes,
// which vary per admin and per provider). For these, plan_code must
// match exactly what the buy-flow page and provider plan mappings use,
// so a dropdown prevents a typo from silently making a pricing rule
// never match. exam_pin: pin type. epin: recharge-card denomination
// (VTU.ng only accepts 100/200/500 — see vtung.ts). electricity: meter
// type (only matters if an admin wants a different fee for prepaid vs
// postpaid — leave blank to price both the same via the
// flexible-amount fallback).
const FIXED_PLAN_CODES: Record<string, string[]> = {
  exam_pin: ["registration", "result_checker"],
  epin: ["100", "200", "500"],
  electricity: ["prepaid", "postpaid"],
}

const PLAN_CODE_LABELS: Record<string, string> = {
  registration: "Registration PIN",
  result_checker: "Result Checker PIN",
  prepaid: "Prepaid",
  postpaid: "Postpaid",
  "100": "₦100 ePIN",
  "200": "₦200 ePIN",
  "500": "₦500 ePIN",
}

export default function AdminPricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [search, setSearch] = useState("")
  const [filterServiceType, setFilterServiceType] = useState("all")
  const [draft, setDraft] = useState({
    serviceType: "data",
    networkOrBiller: NETWORKS_OR_BILLERS["data"][0],
    planCode: "",
    retailPrice: "",
    wholesalePrice: "",
    convenienceFee: "",
  })

  const [csvText, setCsvText] = useState("")
  const [uploadingCsv, setUploadingCsv] = useState(false)
  const [csvResult, setCsvResult] = useState<{
    createdCount: number
    updatedCount: number
    errorCount: number
    results: { row: number; status: "created" | "updated" | "error"; message?: string }[]
  } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/pricing", { headers })
    const data = await res.json()
    setRules(data.rules ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function resetForm() {
    setShowAdd(false)
    setEditingId(null)
    setDraft({ serviceType: "data", networkOrBiller: NETWORKS_OR_BILLERS["data"][0], planCode: "", retailPrice: "", wholesalePrice: "", convenienceFee: "" })
  }

  function handleServiceTypeChange(serviceType: string) {
    const options = NETWORKS_OR_BILLERS[serviceType] ?? []
    const fixedCodes = FIXED_PLAN_CODES[serviceType]
    setDraft({
      ...draft,
      serviceType,
      networkOrBiller: options[0] ?? "",
      // exam_pin and epin both require a plan code to price correctly
      // (pin type / denomination), so default to the first option.
      // electricity's plan_code is optional (blank means "same price
      // regardless of meter type"), so leave it blank rather than
      // force-picking prepaid/postpaid.
      planCode: serviceType === "exam_pin" || serviceType === "epin" ? fixedCodes[0] : "",
    })
  }

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id)
    setShowAdd(true)
    setDraft({
      serviceType: rule.service_type,
      networkOrBiller: rule.network_or_biller,
      planCode: rule.plan_code ?? "",
      retailPrice: String(rule.retail_price_kobo / 100),
      wholesalePrice: String(rule.wholesale_price_kobo / 100),
      convenienceFee: String(rule.convenience_fee_kobo / 100),
    })
  }

  async function handleSave() {
    const headers = await getAuthHeader()
    await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        id: editingId ?? undefined,
        serviceType: draft.serviceType,
        networkOrBiller: draft.networkOrBiller,
        planCode: draft.planCode || null,
        retailPriceKobo: Math.round(parseFloat(draft.retailPrice) * 100),
        wholesalePriceKobo: Math.round(parseFloat(draft.wholesalePrice) * 100),
        convenienceFeeKobo: Math.round((parseFloat(draft.convenienceFee) || 0) * 100),
      }),
    })
    resetForm()
    load()
  }

  async function handleDelete(id: string) {
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/pricing?id=${encodeURIComponent(id)}`, { method: "DELETE", headers })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? `Delete failed (${res.status})`)
      setDeletingId(null)
      return
    }
    setDeletingId(null)
    load()
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const allIds = filteredRules.map((r) => r.id)
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        allIds.forEach((id) => next.delete(id))
      } else {
        allIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected rule${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return
    setBulkDeleting(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/pricing", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setBulkDeleting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "Bulk delete failed")
      return
    }
    setSelectedIds(new Set())
    load()
  }

  async function bulkUploadCsv() {
    if (!csvText.trim()) {
      alert("Paste CSV text first")
      return
    }
    setUploadingCsv(true)
    setCsvResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ csv: csvText }),
    })
    const data = await res.json()
    setUploadingCsv(false)
    if (!res.ok) {
      alert(data.error ?? "Bulk upload failed")
      return
    }
    setCsvResult(data)
    if (data.createdCount + data.updatedCount > 0) load()
  }

  function handleCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result ?? ""))
    reader.readAsText(file)
  }

  // Client-side only — the full rule set is already loaded, so
  // filtering here avoids a round trip and keeps the checkbox
  // selection state (Set<id>) working the same either way.
  const filteredRules = rules.filter((r) => {
    if (filterServiceType !== "all" && r.service_type !== filterServiceType) return false
    if (!search.trim()) return true
    const haystack = `${r.network_or_biller} ${r.plan_code ?? ""}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  // Strip everything except letters/digits and lowercase, so plan
  // codes that only differ in formatting ("230mb-1day-gifting" vs
  // "MTN/230MB/1Day" vs "230MB_1D") normalize to something comparable.
  // This is a heuristic, not a guarantee — it exists to surface
  // candidates for a human to review, not to auto-merge anything.
  function normalizedPlanCode(planCode: string | null): string {
    return (planCode ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  }

  interface DuplicateGroup {
    key: string
    reason: "same price" | "similar plan code"
    rules: PricingRule[]
  }

  // Two independent groupings, each surfacing a different kind of
  // likely duplicate — this is exactly what happens when the same
  // real-world plan gets added twice from different providers, once
  // per provider instead of once with two provider_plan_mappings rows:
  //  1. Same service + network + final price (what the customer pays)
  //  2. Same service + network + a near-identical plan code
  // A group only matters if it has 2+ rows.
  const duplicateGroups: DuplicateGroup[] = (() => {
    const priceGroups = new Map<string, PricingRule[]>()
    const codeGroups = new Map<string, PricingRule[]>()

    for (const r of rules) {
      if (!r.plan_code) continue // flexible-amount rules (airtime etc.) have no plan_code to compare

      const finalPrice = r.retail_price_kobo + r.convenience_fee_kobo
      const priceKey = `${r.service_type}|${r.network_or_biller}|${finalPrice}`
      if (!priceGroups.has(priceKey)) priceGroups.set(priceKey, [])
      priceGroups.get(priceKey)!.push(r)

      const normalized = normalizedPlanCode(r.plan_code)
      if (normalized) {
        const codeKey = `${r.service_type}|${r.network_or_biller}|${normalized}`
        if (!codeGroups.has(codeKey)) codeGroups.set(codeKey, [])
        codeGroups.get(codeKey)!.push(r)
      }
    }

    const groups: DuplicateGroup[] = []
    const seenRuleIdSets = new Set<string>()

    function addGroup(key: string, reason: DuplicateGroup["reason"], groupRules: PricingRule[]) {
      if (groupRules.length < 2) return
      // Avoid showing the same exact set of rule IDs twice (a group
      // that matched on both same price AND similar plan code).
      const idSetKey = groupRules.map((r) => r.id).sort().join(",")
      if (seenRuleIdSets.has(idSetKey)) return
      seenRuleIdSets.add(idSetKey)
      groups.push({ key, reason, rules: groupRules })
    }

    for (const [key, groupRules] of priceGroups) addGroup(key, "same price", groupRules)
    for (const [key, groupRules] of codeGroups) addGroup(key, "similar plan code", groupRules)

    return groups
  })()

  function selectAllButOneInGroup(group: DuplicateGroup) {
    // Keeps the first row (usually the oldest / originally-entered
    // one) unselected, selects the rest — admin can review the
    // selection before hitting "Delete selected", and can freely
    // adjust which one is kept by checking/unchecking rows.
    setSelectedIds((prev) => {
      const next = new Set(prev)
      group.rules.slice(1).forEach((r) => next.add(r.id))
      return next
    })
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-heading font-bold">Pricing Rules</h1>
        <button
          onClick={() => (showAdd ? resetForm() : setShowAdd(true))}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showAdd ? "Cancel" : "Add rule"}
        </button>
      </div>

      {duplicateGroups.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">
            {duplicateGroups.length} possible duplicate {duplicateGroups.length === 1 ? "group" : "groups"}
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            These look like the same real-world plan added more than once — often from adding a second
            provider as its own rule instead of a second row in Provider Plan Mappings for the same plan.
            Review each group below: keep one rule, then either delete the rest here or move to Provider
            Plan Mappings and add the extra rows there for the SAME plan code before deleting the duplicate.
          </p>
          <div className="space-y-3">
            {duplicateGroups.map((group) => (
              <div key={group.key} className="rounded-md border border-amber-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-amber-900">
                    {group.rules[0].service_type.replace("_", " ")} · {group.rules[0].network_or_biller} ·{" "}
                    {group.reason === "same price"
                      ? `same price (${formatNaira(group.rules[0].retail_price_kobo + group.rules[0].convenience_fee_kobo)})`
                      : "similar plan code"}
                  </span>
                  <button
                    onClick={() => selectAllButOneInGroup(group)}
                    className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                  >
                    Select all but one
                  </button>
                </div>
                <ul className="space-y-1">
                  {group.rules.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs text-secondary">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelected(r.id)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                      <span className="font-mono text-muted-foreground">{r.plan_code}</span>
                      <span>— {formatNaira(r.retail_price_kobo + r.convenience_fee_kobo)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="mb-6 rounded-lg border border-border bg-white p-4 sm:max-w-2xl">
          <h2 className="mb-3 text-sm font-semibold text-secondary">{editingId ? "Edit rule" : "New rule"}</h2>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Service type</label>
              <select
                value={draft.serviceType}
                onChange={(e) => handleServiceTypeChange(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Network / Biller</label>
              <select
                value={draft.networkOrBiller}
                onChange={(e) => setDraft({ ...draft, networkOrBiller: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {(NETWORKS_OR_BILLERS[draft.serviceType] ?? []).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                {draft.networkOrBiller && !(NETWORKS_OR_BILLERS[draft.serviceType] ?? []).includes(draft.networkOrBiller) && (
                  <option value={draft.networkOrBiller}>{draft.networkOrBiller} (legacy value — pick a valid one above and save)</option>
                )}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-secondary">
              {draft.serviceType === "exam_pin"
                ? "Pin type"
                : draft.serviceType === "epin"
                  ? "Denomination"
                  : draft.serviceType === "electricity"
                    ? "Meter type (leave blank to price prepaid & postpaid the same)"
                    : "Plan code (leave blank for flexible-amount services)"}
            </label>
            {FIXED_PLAN_CODES[draft.serviceType] ? (
              <select
                value={draft.planCode}
                onChange={(e) => setDraft({ ...draft, planCode: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {draft.serviceType === "electricity" && <option value="">— Any meter type —</option>}
                {FIXED_PLAN_CODES[draft.serviceType].map((c) => (
                  <option key={c} value={c}>{PLAN_CODE_LABELS[c] ?? c}</option>
                ))}
                {draft.planCode && !FIXED_PLAN_CODES[draft.serviceType].includes(draft.planCode) && (
                  <option value={draft.planCode}>{draft.planCode} (legacy value — pick a valid one above and save)</option>
                )}
              </select>
            ) : (
              <input
                value={draft.planCode}
                onChange={(e) => setDraft({ ...draft, planCode: e.target.value })}
                placeholder="1GB_30D"
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            )}
          </div>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Retail price (₦)</label>
              <input
                type="number"
                value={draft.retailPrice}
                onChange={(e) => setDraft({ ...draft, retailPrice: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Wholesale price (₦)</label>
              <input
                type="number"
                value={draft.wholesalePrice}
                onChange={(e) => setDraft({ ...draft, wholesalePrice: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Convenience fee (₦)</label>
              <input
                type="number"
                value={draft.convenienceFee}
                onChange={(e) => setDraft({ ...draft, convenienceFee: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!draft.networkOrBiller || !draft.retailPrice || !draft.wholesalePrice}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:w-auto"
          >
            {editingId ? "Save changes" : "Save rule"}
          </button>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-white p-4 sm:max-w-2xl">
        <h2 className="mb-1 text-sm font-semibold text-secondary">Bulk upload (CSV)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Columns required: service_type, network_or_biller, retail_price_naira, wholesale_price_naira. Optional:
          plan_code (leave blank for flexible-amount services like airtime), convenience_fee_naira. Each row
          checks for an existing rule on the same service/network/plan first, so re-uploading a file updates
          the matching rules instead of duplicating them.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="mb-3 block text-sm" />
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={
            "service_type,network_or_biller,plan_code,retail_price_naira,wholesale_price_naira,convenience_fee_naira\n" +
            "data,MTN,MTN/1GB/30days,600,570,0"
          }
          rows={6}
          className="mb-3 w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
        />
        <button
          onClick={bulkUploadCsv}
          disabled={uploadingCsv}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {uploadingCsv ? "Uploading..." : "Upload CSV"}
        </button>

        {csvResult && (
          <div className="mt-4 rounded-md bg-muted/40 p-3 text-sm">
            <p className="mb-2 font-medium text-secondary">
              {csvResult.createdCount} new, {csvResult.updatedCount} duplicate{csvResult.updatedCount === 1 ? "" : "s"} updated
              {csvResult.errorCount > 0 && `, ${csvResult.errorCount} failed`}
            </p>
            {csvResult.updatedCount > 0 && (
              <ul className="mb-2 space-y-1 text-xs text-secondary">
                {csvResult.results
                  .filter((r) => r.status === "updated")
                  .map((r) => (
                    <li key={r.row}>
                      Row {r.row}: {r.message}
                    </li>
                  ))}
              </ul>
            )}
            {csvResult.errorCount > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {csvResult.results
                  .filter((r) => r.status === "error")
                  .map((r) => (
                    <li key={r.row}>
                      Row {r.row}: {r.message}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {rules.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:max-w-2xl">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search network, biller, or plan code..."
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <select
            value={filterServiceType}
            onChange={(e) => setFilterServiceType(e.target.value)}
            className="rounded-md border border-border px-3 py-2 text-sm sm:w-48"
          >
            <option value="all">All service types</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          No pricing rules yet. Flexible-amount services (airtime, electricity, betting) work without a rule.
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          No rules match your search.
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-2 text-sm">
              <span className="font-medium text-secondary">{selectedIds.size} selected</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:underline">
                  Clear
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkDeleting}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {bulkDeleting ? "Deleting..." : "Delete selected"}
                </button>
              </div>
            </div>
          )}
          {/* Mobile: stacked cards. Hidden from sm and up, where the table takes over. */}
          <div className="space-y-3 sm:hidden">
            {filteredRules.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <div>
                      <p className="text-sm font-semibold capitalize text-secondary">
                        {r.service_type.replace("_", " ")} · {r.network_or_biller}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.plan_code ?? "No plan code"}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Retail</p>
                    <p className="font-medium text-secondary">{formatNaira(r.retail_price_kobo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Wholesale</p>
                    <p className="font-medium text-secondary">{formatNaira(r.wholesale_price_kobo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fee</p>
                    <p className="font-medium text-secondary">{formatNaira(r.convenience_fee_kobo)}</p>
                  </div>
                </div>

                {deletingId === r.id ? (
                  <div className="flex items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-destructive">Delete this rule?</span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 border-t border-border pt-3">
                    <button
                      onClick={() => startEdit(r)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(r.id)}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop / tablet: table. Hidden below sm, where cards take over. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filteredRules.length > 0 && filteredRules.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border"
                      aria-label="Select all rules"
                    />
                  </th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Network/Biller</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Retail</th>
                  <th className="px-4 py-3">Wholesale</th>
                  <th className="px-4 py-3">Fee</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelected(r.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 capitalize">{r.service_type.replace("_", " ")}</td>
                    <td className="px-4 py-3">{r.network_or_biller}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.plan_code ?? "—"}</td>
                    <td className="px-4 py-3">{formatNaira(r.retail_price_kobo)}</td>
                    <td className="px-4 py-3">{formatNaira(r.wholesale_price_kobo)}</td>
                    <td className="px-4 py-3">{formatNaira(r.convenience_fee_kobo)}</td>
                    <td className="px-4 py-3">
                      {deletingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-destructive">Delete this rule?</span>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => startEdit(r)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(r.id)}
                            className="text-xs font-medium text-destructive hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
