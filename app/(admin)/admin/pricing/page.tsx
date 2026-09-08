// app/(admin)/admin/pricing/page.tsx
"use client"

import { useEffect, useState } from "react"
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

const SERVICE_TYPES = ["airtime", "data", "cable", "electricity", "exam_pin", "betting"]

export default function AdminPricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    serviceType: "data",
    networkOrBiller: "",
    planCode: "",
    retailPrice: "",
    wholesalePrice: "",
    convenienceFee: "",
  })

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
    setDraft({ serviceType: "data", networkOrBiller: "", planCode: "", retailPrice: "", wholesalePrice: "", convenienceFee: "" })
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
    setDeletingId(id)
    const headers = await getAuthHeader()
    await fetch(`/api/admin/pricing?id=${encodeURIComponent(id)}`, { method: "DELETE", headers })
    setDeletingId(null)
    load()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Pricing Rules</h1>
        <button
          onClick={() => (showAdd ? resetForm() : setShowAdd(true))}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showAdd ? "Cancel" : "Add rule"}
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 max-w-2xl rounded-lg border border-border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-secondary">{editingId ? "Edit rule" : "New rule"}</h2>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Service type</label>
              <select
                value={draft.serviceType}
                onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              >
                {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">Network / Biller</label>
              <input
                value={draft.networkOrBiller}
                onChange={(e) => setDraft({ ...draft, networkOrBiller: e.target.value })}
                placeholder="MTN, DSTV, etc."
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-secondary">Plan code (leave blank for flexible-amount services)</label>
            <input
              value={draft.planCode}
              onChange={(e) => setDraft({ ...draft, planCode: e.target.value })}
              placeholder="1GB_30D"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-3 grid grid-cols-3 gap-3">
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
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {editingId ? "Save changes" : "Save rule"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
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
              {rules.map((r) => (
                <tr key={r.id}>
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
              {rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No pricing rules yet. Flexible-amount services (airtime, electricity, betting) work without a rule.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
