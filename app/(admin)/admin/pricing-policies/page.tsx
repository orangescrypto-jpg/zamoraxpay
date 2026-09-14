// app/(admin)/admin/pricing-policies/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

type FeeType = "flat" | "percentage"

interface PricingPolicy {
  serviceType: string
  retailFeeType: FeeType
  retailFeeValue: number
  wholesaleFeeType: FeeType
  wholesaleFeeValue: number
  convenienceFeeType: FeeType
  convenienceFeeValue: number
  updatedBy: string | null
  updatedAt: string
}

interface EditableRow {
  serviceType: string
  retailFeeType: FeeType
  retailFeeNaira: string // percentage stored as e.g. "5" meaning 5%; flat stored as naira
  wholesaleFeeType: FeeType
  wholesaleFeeNaira: string
  convenienceFeeType: FeeType
  convenienceFeeNaira: string
}

const SERVICE_LABELS: Record<string, string> = {
  data: "Data",
  cable: "Cable TV",
  electricity: "Electricity",
  airtime: "Airtime",
  exam_pin: "Exam Pin",
}

// Basis points <-> percent for display. 500 basis points = 5%.
function basisPointsToPercent(bp: number): string {
  return (bp / 100).toString()
}
function percentToBasisPoints(percent: string): number {
  return Math.round(parseFloat(percent || "0") * 100)
}
function koboToNaira(kobo: number): string {
  return (kobo / 100).toString()
}
function nairaToKobo(naira: string): number {
  return Math.round(parseFloat(naira || "0") * 100)
}

function policyToEditableRow(p: PricingPolicy): EditableRow {
  return {
    serviceType: p.serviceType,
    retailFeeType: p.retailFeeType,
    retailFeeNaira:
      p.retailFeeType === "percentage" ? basisPointsToPercent(p.retailFeeValue) : koboToNaira(p.retailFeeValue),
    wholesaleFeeType: p.wholesaleFeeType,
    wholesaleFeeNaira:
      p.wholesaleFeeType === "percentage"
        ? basisPointsToPercent(p.wholesaleFeeValue)
        : koboToNaira(p.wholesaleFeeValue),
    convenienceFeeType: p.convenienceFeeType,
    convenienceFeeNaira:
      p.convenienceFeeType === "percentage"
        ? basisPointsToPercent(p.convenienceFeeValue)
        : koboToNaira(p.convenienceFeeValue),
  }
}

export default function PricingPoliciesPage() {
  const [rows, setRows] = useState<EditableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { success?: boolean; error?: string; reconciled?: any }>>({})

  async function getAuthHeader() {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/pricing-policies", { headers })
    const data = await res.json()
    const policies: PricingPolicy[] = data.policies ?? []
    setRows(policies.map(policyToEditableRow))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function updateRow(serviceType: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.serviceType === serviceType ? { ...r, ...patch } : r)))
  }

  async function savePolicy(row: EditableRow) {
    setSavingType(row.serviceType)
    setResults((prev) => ({ ...prev, [row.serviceType]: {} }))
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/admin/pricing-policies", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: row.serviceType,
          retailFeeType: row.retailFeeType,
          retailFeeValue:
            row.retailFeeType === "percentage"
              ? percentToBasisPoints(row.retailFeeNaira)
              : nairaToKobo(row.retailFeeNaira),
          wholesaleFeeType: row.wholesaleFeeType,
          wholesaleFeeValue:
            row.wholesaleFeeType === "percentage"
              ? percentToBasisPoints(row.wholesaleFeeNaira)
              : nairaToKobo(row.wholesaleFeeNaira),
          convenienceFeeType: row.convenienceFeeType,
          convenienceFeeValue:
            row.convenienceFeeType === "percentage"
              ? percentToBasisPoints(row.convenienceFeeNaira)
              : nairaToKobo(row.convenienceFeeNaira),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResults((prev) => ({ ...prev, [row.serviceType]: { error: data.error ?? "Save failed" } }))
      } else {
        setResults((prev) => ({ ...prev, [row.serviceType]: { success: true, reconciled: data.reconciled } }))
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [row.serviceType]: { error: err instanceof Error ? err.message : "Save failed" },
      }))
    } finally {
      setSavingType(null)
    }
  }

  if (loading) return <div className="p-6">Loading...</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold text-secondary">Pricing Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set one general retail, wholesale, and convenience fee per service. This applies automatically to every
          plan under that service — except plans you've priced individually by hand, which stay untouched. Saving
          here reprices every auto-priced plan under that service immediately.
        </p>
      </div>

      {rows.map((row) => {
        const result = results[row.serviceType]
        return (
          <div key={row.serviceType} className="rounded-lg border border-border bg-white p-4">
            <h2 className="mb-3 font-heading font-semibold text-secondary">
              {SERVICE_LABELS[row.serviceType] ?? row.serviceType}
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <FeeInput
                label="Retail fee"
                feeType={row.retailFeeType}
                value={row.retailFeeNaira}
                onTypeChange={(t) => updateRow(row.serviceType, { retailFeeType: t })}
                onValueChange={(v) => updateRow(row.serviceType, { retailFeeNaira: v })}
              />
              <FeeInput
                label="Wholesale fee"
                feeType={row.wholesaleFeeType}
                value={row.wholesaleFeeNaira}
                onTypeChange={(t) => updateRow(row.serviceType, { wholesaleFeeType: t })}
                onValueChange={(v) => updateRow(row.serviceType, { wholesaleFeeNaira: v })}
              />
              <FeeInput
                label="Convenience fee"
                feeType={row.convenienceFeeType}
                value={row.convenienceFeeNaira}
                onTypeChange={(t) => updateRow(row.serviceType, { convenienceFeeType: t })}
                onValueChange={(v) => updateRow(row.serviceType, { convenienceFeeNaira: v })}
              />
            </div>

            <button
              onClick={() => savePolicy(row)}
              disabled={savingType === row.serviceType}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingType === row.serviceType ? "Saving..." : "Save & apply to all plans"}
            </button>

            {result?.error && <p className="mt-3 text-sm text-destructive">{result.error}</p>}
            {result?.success && (
              <p className="mt-3 text-sm font-medium text-secondary">
                Applied. {result.reconciled?.scanned ?? 0} plans scanned —{" "}
                {result.reconciled?.created ?? 0} created, {result.reconciled?.updated ?? 0} repriced,{" "}
                {result.reconciled?.skippedManual ?? 0} left untouched (manually priced).
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FeeInput({
  label,
  feeType,
  value,
  onTypeChange,
  onValueChange,
}: {
  label: string
  feeType: FeeType
  value: string
  onTypeChange: (t: FeeType) => void
  onValueChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <select
          value={feeType}
          onChange={(e) => onTypeChange(e.target.value as FeeType)}
          className="rounded-md border border-border px-2 py-2 text-sm"
        >
          <option value="flat">₦ flat</option>
          <option value="percentage">%</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder={feeType === "percentage" ? "e.g. 5" : "e.g. 10"}
        />
      </div>
    </div>
  )
}
