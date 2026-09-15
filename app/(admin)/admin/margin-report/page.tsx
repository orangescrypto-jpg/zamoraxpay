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

const SERVICE_TYPES = ["", "data", "cable", "exam_pin", "epin", "electricity", "airtime"]

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
      const res = await fetch(`/api/admin/margin-report?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to load margin report")
      } else {
        setSummary(data.summary)
        setOrders(data.orders)
        setPlans(data.plans)
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
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-1 font-heading text-xl font-semibold text-secondary">Margin Report</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Real per-order profit/loss (what the customer paid vs what the fulfilling provider actually cost), plus
        each plan's built-in cushion from the last pricing sync — best case (cheapest provider fulfills) vs worst
        case (router falls all the way to the priciest live provider).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border bg-white p-1 text-sm">
          <button
            onClick={() => setTab("orders")}
            className={cn("rounded px-3 py-1.5", tab === "orders" ? "bg-primary text-primary-foreground" : "text-secondary")}
          >
            Real orders
          </button>
          <button
            onClick={() => setTab("plans")}
            className={cn("rounded px-3 py-1.5", tab === "plans" ? "bg-primary text-primary-foreground" : "text-secondary")}
          >
            Plan pricing basis
          </button>
        </div>
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          {SERVICE_TYPES.map((s) => (
            <option key={s} value={s}>{s || "All services"}</option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {summary && tab === "orders" && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-white p-3">
            <p className="text-xs text-muted-foreground">Orders shown</p>
            <p className="text-lg font-semibold text-secondary">{summary.totalOrders}</p>
          </div>
          <div className="rounded-lg border border-border bg-white p-3">
            <p className="text-xs text-muted-foreground">Negative-margin orders</p>
            <p className={cn("text-lg font-semibold", summary.negativeMarginOrderCount > 0 ? "text-destructive" : "text-secondary")}>
              {summary.negativeMarginOrderCount}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-white p-3">
            <p className="text-xs text-muted-foreground">Net margin (shown orders)</p>
            <p className={cn("text-lg font-semibold", summary.totalMarginKobo < 0 ? "text-destructive" : "text-secondary")}>
              {formatNaira(summary.totalMarginKobo / 100)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-white p-3">
            <p className="text-xs text-muted-foreground">Total lost on fallbacks</p>
            <p className={cn("text-lg font-semibold", summary.totalLossFromNegativeOrdersKobo < 0 ? "text-destructive" : "text-secondary")}>
              {formatNaira(summary.totalLossFromNegativeOrdersKobo / 100)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tab === "orders" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Network/Biller</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Provider used</th>
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
                  <td className="px-3 py-2 text-xs">{o.planCode ?? "—"}</td>
                  <td className="px-3 py-2">{o.providerUsed ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(o.chargedKobo / 100)}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(o.actualCostKobo / 100)}</td>
                  <td className={cn("px-3 py-2 text-right font-medium", o.marginKobo < 0 ? "text-destructive" : "text-secondary")}>
                    {formatNaira(o.marginKobo / 100)}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No successful orders with recorded provider cost yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Network/Biller</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2 text-right">Retail price</th>
                <th className="px-3 py-2">Priced from</th>
                <th className="px-3 py-2 text-right">Cheapest live</th>
                <th className="px-3 py-2 text-right">Worst live</th>
                <th className="px-3 py-2 text-right">Best-case margin</th>
                <th className="px-3 py-2 text-right">Worst-case margin</th>
                <th className="px-3 py-2 text-right">Live providers</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={`${p.serviceType}-${p.networkOrBiller}-${p.planCode}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2">{p.serviceType}</td>
                  <td className="px-3 py-2">{p.networkOrBiller}</td>
                  <td className="px-3 py-2 text-xs">{p.planCode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(p.retailPriceKobo / 100)}</td>
                  <td className="px-3 py-2 text-xs">{p.pricingBasisProviderKey ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {p.cheapestLiveCostKobo != null ? formatNaira(p.cheapestLiveCostKobo / 100) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.worstLiveCostKobo != null ? formatNaira(p.worstLiveCostKobo / 100) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-secondary">{formatNaira(p.bestCaseMarginKobo / 100)}</td>
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
