// app/(admin)/admin/provider-plans/page.tsx
"use client"

import { useEffect, useState } from "react"
import type { ChangeEvent } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface PlanMapping {
  id: string
  serviceType: string
  networkOrBiller: string
  planCode: string
  providerKey: string
  providerPlanId: string
  providerCostKobo: number
  providerPlanLabel: string | null
  isActive: boolean
}

// Must exactly match app/(admin)/admin/pricing/page.tsx's NETWORKS_OR_BILLERS —
// that's the canonical list the buy-flow pages and Pricing Rules use, so
// picking from here guarantees the mapping's network/biller will actually
// match a pricing rule (and what checkout sends) instead of drifting via
// free text (e.g. "Glo" vs "GLO").
const NETWORKS_OR_BILLERS: Record<string, string[]> = {
  data: ["MTN", "Airtel", "Glo", "9mobile"],
  cable: ["DSTV", "GOtv", "StarTimes"],
  exam_pin: ["WAEC", "NECO", "JAMB", "NABTEB"],
  electricity: ["IKEDC", "EKEDC", "AEDC", "PHEDC", "IBEDC", "KEDCO"],
}

// Some services have a fixed, small set of valid plan_code values
// rather than admin-free-text plan codes (like data bundle codes). For
// these, offer a picker instead of free text — must match
// app/(admin)/admin/pricing/page.tsx's FIXED_PLAN_CODES exactly, since
// this is the same value a pricing rule and the router's
// getPlanProviderOptions lookup key on.
const FIXED_PLAN_CODES: Record<string, string[]> = {
  exam_pin: ["registration", "result_checker"],
  electricity: ["prepaid", "postpaid"],
}

const PLAN_CODE_LABELS: Record<string, string> = {
  registration: "Registration PIN",
  result_checker: "Result Checker PIN",
  prepaid: "Prepaid",
  postpaid: "Postpaid",
}

const EMPTY_FORM = {
  serviceType: "data",
  networkOrBiller: NETWORKS_OR_BILLERS["data"][0],
  planCode: "",
  providerKey: "pairgate",
  providerPlanId: "",
  providerCostNaira: "",
  providerPlanLabel: "",
}

export default function ProviderPlanMappingsPage() {
  const [mappings, setMappings] = useState<PlanMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [search, setSearch] = useState("")
  const [filterServiceType, setFilterServiceType] = useState("all")

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
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/provider-plan-mappings", { headers })
    const data = await res.json()
    setMappings(data.mappings ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function saveMapping() {
    if (!form.networkOrBiller || !form.planCode || !form.providerPlanId || !form.providerCostNaira) {
      alert("Fill in network/biller, plan code, provider plan ID, and cost")
      return
    }

    // Same natural key the UNIQUE(service_type, network_or_biller, plan_code,
    // provider_key) constraint covers — if a row already exists there and
    // we're not already editing it, saving will silently overwrite it.
    // Warn first so the admin knows before it happens.
    if (!editingId) {
      const duplicate = mappings.find(
        (m) =>
          m.serviceType === form.serviceType &&
          m.networkOrBiller === form.networkOrBiller &&
          m.planCode === form.planCode &&
          m.providerKey === form.providerKey,
      )
      if (duplicate) {
        const confirmed = confirm(
          `A mapping already exists for ${form.providerKey} on ${form.networkOrBiller} ${form.planCode} ` +
            `(plan id ${duplicate.providerPlanId}, ₦${(duplicate.providerCostKobo / 100).toLocaleString()}). ` +
            `Saving will overwrite it with the new values. Continue?`,
        )
        if (!confirmed) return
      }
    }

    setSaving(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/provider-plan-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        id: editingId ?? undefined,
        serviceType: form.serviceType,
        networkOrBiller: form.networkOrBiller,
        planCode: form.planCode,
        providerKey: form.providerKey,
        providerPlanId: form.providerPlanId,
        providerCostKobo: Math.round(parseFloat(form.providerCostNaira) * 100),
        providerPlanLabel: form.providerPlanLabel || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? "Failed to save mapping")
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    load()
  }

  function startEdit(m: PlanMapping) {
    setEditingId(m.id)
    setForm({
      serviceType: m.serviceType,
      networkOrBiller: m.networkOrBiller,
      planCode: m.planCode,
      providerKey: m.providerKey,
      providerPlanId: m.providerPlanId,
      providerCostNaira: String(m.providerCostKobo / 100),
      providerPlanLabel: m.providerPlanLabel ?? "",
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function bulkUploadCsv() {
    if (!csvText.trim()) {
      alert("Paste CSV text first")
      return
    }
    setUploadingCsv(true)
    setCsvResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/provider-plan-mappings/bulk", {
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

  async function toggleActive(m: PlanMapping) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/provider-plan-mappings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
    })
    load()
  }

  async function remove(m: PlanMapping) {
    if (!confirm(`Remove ${m.providerKey} mapping for ${m.networkOrBiller} ${m.planCode}?`)) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/provider-plan-mappings?id=${m.id}`, { method: "DELETE", headers })
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

  function toggleSelectAllInGroup(group: PlanMapping[]) {
    const groupIds = group.map((m) => m.id)
    const allSelected = groupIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id))
      } else {
        groupIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Remove ${selectedIds.size} selected mapping${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return
    setBulkDeleting(true)
    const headers = await getAuthHeader()
    await fetch("/api/admin/provider-plan-mappings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setBulkDeleting(false)
    setSelectedIds(new Set())
    load()
  }

  // Group by our plan (service+network+planCode) so the cheapest-first
  // ordering the router will actually use is obvious at a glance.
  // Client-side filter is applied before grouping, so a search hides
  // whole groups that don't match rather than leaving empty ones.
  const filteredMappings = mappings.filter((m) => {
    if (filterServiceType !== "all" && m.serviceType !== filterServiceType) return false
    if (!search.trim()) return true
    const haystack = `${m.networkOrBiller} ${m.planCode} ${m.providerKey} ${m.providerPlanId} ${m.providerPlanLabel ?? ""}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  const grouped = filteredMappings.reduce<Record<string, PlanMapping[]>>((acc, m) => {
    const key = `${m.serviceType}|${m.networkOrBiller}|${m.planCode}`
    acc[key] = acc[key] ? [...acc[key], m] : [m]
    return acc
  }, {})

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-heading font-bold">Provider Plan Mappings</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Map the same plan (e.g. "MTN 200MB — 1 Day") to its plan ID and cost on each VTU provider
        that offers it. When more than one enabled provider is mapped to the same plan, the router
        tries the cheapest one first automatically, falling back to the next cheapest if it fails.
      </p>

      <div className="mb-8 max-w-2xl rounded-lg border border-border bg-white p-4">
        <h2 className="mb-3 font-heading font-semibold text-secondary">
          {editingId ? "Edit mapping" : "Add / update a mapping"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Service type
            <select
              value={form.serviceType}
              onChange={(e) => {
                const serviceType = e.target.value
                const options = NETWORKS_OR_BILLERS[serviceType] ?? []
                const fixedCodes = FIXED_PLAN_CODES[serviceType]
                setForm({
                  ...form,
                  serviceType,
                  networkOrBiller: options[0] ?? "",
                  planCode: fixedCodes ? fixedCodes[0] : "",
                })
              }}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="data">Data</option>
              <option value="cable">Cable</option>
              <option value="exam_pin">Exam PIN</option>
              <option value="electricity">Electricity</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Provider
            <select
              value={form.providerKey}
              onChange={(e) => setForm({ ...form, providerKey: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="pairgate">Pairgate</option>
              <option value="cheapdatahub">CheapDataHub</option>
              <option value="vtpass">VTpass</option>
              <option value="vtung">VTU.ng</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Network / Biller
            <select
              value={form.networkOrBiller}
              onChange={(e) => setForm({ ...form, networkOrBiller: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
            >
              {(NETWORKS_OR_BILLERS[form.serviceType] ?? []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            OUR plan code (matches Pricing Rules)
            {FIXED_PLAN_CODES[form.serviceType] ? (
              <select
                value={form.planCode}
                onChange={(e) => setForm({ ...form, planCode: e.target.value })}
                className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              >
                {FIXED_PLAN_CODES[form.serviceType].map((c) => (
                  <option key={c} value={c}>{PLAN_CODE_LABELS[c] ?? c}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.planCode}
                onChange={(e) => setForm({ ...form, planCode: e.target.value })}
                className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
                placeholder="mtn-200mb-1day"
              />
            )}
          </label>
          <label className="text-xs text-muted-foreground">
            {form.serviceType === "electricity"
              ? "Provider priority marker (cost-ranking only)"
              : "Provider's plan ID / variation ID / provider_id"}
            <input
              value={form.providerPlanId}
              onChange={(e) => setForm({ ...form, providerPlanId: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder={
                form.serviceType === "exam_pin"
                  ? "VTpass/CheapDataHub: variation_code or product_id (e.g. waec-3). Pairgate: full provider_id (e.g. waec-result-checker)"
                  : form.serviceType === "electricity"
                    ? "e.g. ikedc-prepaid-pairgate (any label — never sent to the provider)"
                    : "e.g. 45 (Pairgate plan_id)"
              }
            />
            {form.serviceType === "exam_pin" && (
              <span className="mt-1 block text-[11px] text-muted-foreground/80">
                For Pairgate, whose /education/purchase has no separate plan field, this value
                overrides the exam body sent as provider_id (e.g. "waec-registration" vs
                "waec-result-checker") — not the plan code. For VTpass/CheapDataHub it overrides
                their plan/variation/product ID as usual.
              </span>
            )}
            {form.serviceType === "electricity" && (
              <span className="mt-1 block text-[11px] text-muted-foreground/80">
                Every provider already takes "prepaid"/"postpaid" directly — there's no
                provider-specific code to map. This value is only used to pick and cost-rank the
                cheapest provider for this biller + meter type; put anything meaningful to you
                (it's never sent to the provider).
              </span>
            )}
          </label>
          <label className="text-xs text-muted-foreground">
            Provider's cost (₦)
            <input
              value={form.providerCostNaira}
              onChange={(e) => setForm({ ...form, providerCostNaira: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="92"
              inputMode="decimal"
            />
          </label>
          <label className="col-span-2 text-xs text-muted-foreground">
            Label (optional, for your own reference)
            <input
              value={form.providerPlanLabel}
              onChange={(e) => setForm({ ...form, providerPlanLabel: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="MTN 200MB - 1 Day"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveMapping}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Update mapping" : "Save mapping"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className="text-sm text-muted-foreground hover:underline">
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div className="mb-8 max-w-2xl rounded-lg border border-border bg-white p-4">
        <h2 className="mb-1 font-heading font-semibold text-secondary">Bulk upload (CSV)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Columns required: service_type, network_or_biller, plan_code, provider_key, provider_plan_id,
          provider_cost_naira. Optional: provider_plan_label. Each row upserts the same way the form above
          does, so re-uploading a file just updates the matching rows instead of duplicating them.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="mb-3 block text-sm" />
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={
            "service_type,network_or_biller,plan_code,provider_key,provider_plan_id,provider_cost_naira,provider_plan_label\n" +
            "data,MTN,mtn-1gb-30days,cheapdatahub,88,350,MTN 1GB Monthly"
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

      {mappings.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:max-w-2xl">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search network, plan code, provider..."
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <select
            value={filterServiceType}
            onChange={(e) => setFilterServiceType(e.target.value)}
            className="rounded-md border border-border px-3 py-2 text-sm sm:w-48"
          >
            <option value="all">All service types</option>
            {Object.keys(NETWORKS_OR_BILLERS).map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plan mappings yet.</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">No mappings match your search.</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          {selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-2 text-sm">
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
          {Object.entries(grouped).map(([key, group]) => {
            const [serviceType, networkOrBiller, planCode] = key.split("|")
            const groupIds = group.map((m) => m.id)
            const allSelected = groupIds.every((id) => selectedIds.has(id))
            return (
              <div key={key} className="rounded-lg border border-border bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAllInGroup(group)}
                    className="h-4 w-4 rounded border-border"
                    aria-label={`Select all mappings for ${serviceType} ${networkOrBiller} ${planCode}`}
                  />
                  <p className="text-sm font-medium text-secondary">
                    {serviceType} · {networkOrBiller} · {planCode}
                  </p>
                </div>
                <div className="space-y-1">
                  {group
                    .slice()
                    .sort((a, b) => a.providerCostKobo - b.providerCostKobo)
                    .map((m, idx) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(m.id)}
                            onChange={() => toggleSelected(m.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          {idx === 0 && <span className="mr-1 text-accent">★ cheapest</span>}
                          {m.providerKey}
                          {m.serviceType === "electricity" ? "" : ` — plan id ${m.providerPlanId}`}
                          {" "}— ₦{(m.providerCostKobo / 100).toLocaleString()}
                          {m.providerPlanLabel ? ` (${m.providerPlanLabel})` : ""}
                          {!m.isActive && <span className="ml-2 text-muted-foreground">(inactive)</span>}
                        </span>
                        <span className="flex gap-3">
                          <button onClick={() => startEdit(m)} className="text-xs text-primary hover:underline">
                            Edit
                          </button>
                          <button onClick={() => toggleActive(m)} className="text-xs text-primary hover:underline">
                            {m.isActive ? "Disable" : "Enable"}
                          </button>
                          <button onClick={() => remove(m)} className="text-xs text-destructive hover:underline">
                            Remove
                          </button>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
