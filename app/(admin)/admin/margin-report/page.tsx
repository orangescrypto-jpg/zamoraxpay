// app/(admin)/admin/margin-report/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface OrderMarginRow {
  orderId: string
  serviceType: string
  networkOrBiller: string
  planCode: string | null
  providerUsed: string | null
  chargedKobo: number
  actualCostKobo: number
  marginKobo: number
  createdAt: string
}

interface PlanMarginRow {
  serviceType: string
  networkOrBiller: string
  planCode: string | null
  retailPriceKobo: number
  pricingBasisProviderKey: string | null
  pricingBasisCostKobo: number | null
  cheapestLiveCostKobo: number | null
  worstLiveCostKobo: number | null
  liveProviderCount: number | null
  bestCaseMarginKobo: number
  worstCaseMarginKobo: number
  updatedAt: string
}

interface Summary {
  totalOrders: number
  negativeMarginOrderCount: number
  totalMarginKobo: number
  totalLossFromNegativeOrdersKobo: number
}

export default function MarginReportPage() {
  const [tab, setTab] = useState<"orders" | "plans">("orders")
  const [serviceType, setServiceType] = useState("")
  const [summary, setSummary] = useState<Summary | null>(null)
  const [orders, setOrders] = useState<OrderMarginRow[]>([])
  const [plans, setPlans] = useState<PlanMarginRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeader()
      const params = new URLSearchParams()
      if (serviceType) params.set("serviceType", serviceType)
      const res = await fetch(`/api/admin/margin-report?${params.toString()}`, { headers })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to load margin report")
      } else {
        setSummary(data.summary)
        setOrders(data.orders ?? [])
        setPlans(data.plans ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load margin report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceType])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold text-secondary">Margin Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order-level margin is ground truth from actual fulfillment costs. Plan-level margin is forward-looking,
          from the last pricing reconcile.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="">All services</option>
          <option value="data">Data</option>
          <option value="cable">Cable TV</option>
          <option value="electricity">Electricity</option>
          <option value="airtime">Airtime</option>
          <option value="exam_pin">Exam Pin</option>
        </select>
        <button
          onClick={load}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary hover:bg-bg"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-white p-4">
            <p className="text-xs text-muted-foreground">Orders (recent)</p>
            <p className="mt-1 font-heading text-lg font-semibold text-secondary">{summary.totalOrders}</p>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <p className="text-xs text-muted-foreground">Negative-margin orders</p>
            <p
              className={cn(
                "mt-1 font-heading text-lg font-semibold",
                summary.negativeMarginOrderCount > 0 ? "text-destructive" : "text-secondary",
              )}
            >
              {summary.negativeMarginOrderCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <p className="text-xs text-muted-foreground">Total margin</p>
            <p
              className={cn(
                "mt-1 font-heading text-lg font-semibold",
                summary.totalMarginKobo < 0 ? "text-destructive" : "text-secondary",
              )}
            >
              {formatNaira(summary.totalMarginKobo / 100)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <p className="text-xs text-muted-foreground">Loss from negative orders</p>
            <p className="mt-1 font-heading text-lg font-semibold text-destructive">
              {formatNaira(summary.totalLossFromNegativeOrdersKobo / 100)}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("orders")}
          className={cn(
            "px-4 py-2 text-sm font-medium",
            tab === "orders" ? "border-b-2 border-primary text-secondary" : "text-muted-foreground",
          )}
        >
          Orders (real)
        </button>
        <button
          onClick={() => setTab("plans")}
          className={cn(
            "px-4 py-2 text-sm font-medium",
            tab === "plans" ? "border-b-2 border-primary text-secondary" : "text-muted-foreground",
          )}
        >
          Plans (forward-looking)
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : tab === "orders" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-bg text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Network/Biller</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">Provider used</th>
                <th className="px-3 py-2 text-right">Charged</th>
                <th className="px-3 py-2 text-right">Actual cost</th>
                <th className="px-3 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(o.createdAt)}</td>
                  <td className="px-3 py-2">{o.serviceType}</td>
                  <td className="px-3 py-2">{o.networkOrBiller}</td>
                  <td className="px-3 py-2">{o.planCode ?? "—"}</td>
                  <td className="px-3 py-2">{o.providerUsed ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(o.chargedKobo / 100)}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(o.actualCostKobo / 100)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-medium",
                      o.marginKobo < 0 ? "text-destructive" : "text-secondary",
                    )}
                  >
                    {formatNaira(o.marginKobo / 100)}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No successful orders with a recorded actual cost yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-bg text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Network/Biller</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Retail price</th>
                <th className="px-3 py-2 text-left">Basis provider</th>
                <th className="px-3 py-2 text-right">Basis cost</th>
                <th className="px-3 py-2 text-right">Cheapest live cost</th>
                <th className="px-3 py-2 text-right">Worst live cost</th>
                <th className="px-3 py-2 text-right">Best-case margin</th>
                <th className="px-3 py-2 text-right">Worst-case margin</th>
                <th className="px-3 py-2 text-right"># live providers</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={`${p.serviceType}-${p.networkOrBiller}-${p.planCode}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2">{p.serviceType}</td>
                  <td className="px-3 py-2">{p.networkOrBiller}</td>
                  <td className="px-3 py-2">{p.planCode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(p.retailPriceKobo / 100)}</td>
                  <td className="px-3 py-2">{p.pricingBasisProviderKey ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {p.pricingBasisCostKobo != null ? formatNaira(p.pricingBasisCostKobo / 100) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.cheapestLiveCostKobo != null ? formatNaira(p.cheapestLiveCostKobo / 100) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.worstLiveCostKobo != null ? formatNaira(p.worstLiveCostKobo / 100) : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-medium", p.bestCaseMarginKobo < 0 ? "text-destructive" : "text-secondary")}>
                    {formatNaira(p.bestCaseMarginKobo / 100)}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-medium", p.worstCaseMarginKobo < 0 ? "text-destructive" : "text-secondary")}>
                    {formatNaira(p.worstCaseMarginKobo / 100)}
                  </td>
                  <td className="px-3 py-2 text-right">{p.liveProviderCount ?? "—"}</td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No auto-priced plans with a recorded pricing basis yet — run a provider sync first.
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
