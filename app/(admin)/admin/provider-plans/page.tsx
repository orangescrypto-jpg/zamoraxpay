// app/(admin)/admin/provider-plans/page.tsx
"use client"

import { useEffect, useState } from "react"
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

const EMPTY_FORM = {
  serviceType: "data",
  networkOrBiller: "",
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
    setSaving(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/provider-plan-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        serviceType: form.serviceType,
        networkOrBiller: form.networkOrBiller.toUpperCase(),
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
    load()
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

  // Group by our plan (service+network+planCode) so the cheapest-first
  // ordering the router will actually use is obvious at a glance.
  const grouped = mappings.reduce<Record<string, PlanMapping[]>>((acc, m) => {
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
        <h2 className="mb-3 font-heading font-semibold text-secondary">Add / update a mapping</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Service type
            <select
              value={form.serviceType}
              onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="data">Data</option>
              <option value="cable">Cable</option>
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
            Network / Biller (e.g. MTN, DSTV)
            <input
              value={form.networkOrBiller}
              onChange={(e) => setForm({ ...form, networkOrBiller: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="MTN"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            OUR plan code (matches Pricing Rules)
            <input
              value={form.planCode}
              onChange={(e) => setForm({ ...form, planCode: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="mtn-200mb-1day"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Provider's plan ID / variation ID
            <input
              value={form.providerPlanId}
              onChange={(e) => setForm({ ...form, providerPlanId: e.target.value })}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="e.g. 45 (Pairgate plan_id)"
            />
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
        <button
          onClick={saveMapping}
          disabled={saving}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save mapping"}
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">No plan mappings yet.</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          {Object.entries(grouped).map(([key, group]) => {
            const [serviceType, networkOrBiller, planCode] = key.split("|")
            return (
              <div key={key} className="rounded-lg border border-border bg-white p-4">
                <p className="mb-2 text-sm font-medium text-secondary">
                  {serviceType} · {networkOrBiller} · {planCode}
                </p>
                <div className="space-y-1">
                  {group
                    .slice()
                    .sort((a, b) => a.providerCostKobo - b.providerCostKobo)
                    .map((m, idx) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <span>
                          {idx === 0 && <span className="mr-1 text-accent">★ cheapest</span>}
                          {m.providerKey} — plan id {m.providerPlanId} — ₦{(m.providerCostKobo / 100).toLocaleString()}
                          {m.providerPlanLabel ? ` (${m.providerPlanLabel})` : ""}
                          {!m.isActive && <span className="ml-2 text-muted-foreground">(inactive)</span>}
                        </span>
                        <span className="flex gap-3">
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
