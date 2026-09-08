// app/(admin)/admin/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import type { DashboardOverview, ServiceBreakdown, DailyVolumePoint, ProviderPerformance } from "@/src/services/analytics"

interface AnalyticsData {
  overview: DashboardOverview
  serviceBreakdown: ServiceBreakdown[]
  dailyVolume: DailyVolumePoint[]
  providerPerformance: ProviderPerformance[]
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      setData(json)
    }
    load()
  }, [])

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const { overview, serviceBreakdown, dailyVolume, providerPerformance } = data
  const maxDailyVolume = Math.max(...dailyVolume.map((d) => d.volumeKobo), 1)

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Dashboard</h1>

      {/* Top-level stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Users" value={overview.totalUsers.toLocaleString()} />
        <StatCard label="Active Users" value={overview.activeUsers.toLocaleString()} accent />
        <StatCard label="Resellers" value={overview.resellerUsers.toLocaleString()} />
        <StatCard label="Suspended/Frozen" value={overview.suspendedUsers.toLocaleString()} danger={overview.suspendedUsers > 0} />

        <StatCard label="Total Orders" value={overview.totalOrders.toLocaleString()} />
        <StatCard label="Successful Orders" value={overview.successfulOrders.toLocaleString()} accent />
        <StatCard label="Failed Orders" value={overview.failedOrders.toLocaleString()} danger={overview.failedOrders > 0} />
        <StatCard label="Pending Orders" value={overview.pendingOrders.toLocaleString()} />

        <StatCard label="Successful Volume (all-time)" value={formatNaira(overview.successfulVolumeKobo)} wide />
        <StatCard label="Total Wallet Balances Held" value={formatNaira(overview.totalWalletBalanceKobo)} wide />

        <StatCard label="Orders Today" value={overview.ordersToday.toLocaleString()} />
        <StatCard label="Volume Today" value={formatNaira(overview.volumeTodayKobo)} />
        <StatCard label="New Users Today" value={overview.newUsersToday.toLocaleString()} />
        <StatCard label="New Users (7d)" value={overview.newUsersThisWeek.toLocaleString()} />

        {overview.openFraudFlags > 0 && (
          <StatCard label="Open Fraud Flags" value={overview.openFraudFlags.toLocaleString()} danger wide />
        )}
      </div>

      {/* Daily volume chart (simple bar chart, no external lib) */}
      <div className="mb-8 rounded-lg border border-border bg-white p-5">
        <h2 className="mb-4 font-heading font-semibold text-secondary">Order Volume — Last 14 Days</h2>
        {dailyVolume.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="flex h-40 items-end gap-1.5">
            {dailyVolume.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="rounded-t bg-primary transition-all group-hover:bg-primary/80"
                  style={{ height: `${Math.max((d.volumeKobo / maxDailyVolume) * 140, 2)}px` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-secondary px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">
                  {d.date}: {formatNaira(d.volumeKobo)} ({d.orderCount} orders)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Service breakdown */}
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="mb-4 font-heading font-semibold text-secondary">By Service</h2>
          {serviceBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="space-y-3">
              {serviceBreakdown.map((s) => (
                <div key={s.serviceType} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-secondary">{s.serviceType.replace("_", " ")}</span>
                  <span className="text-muted-foreground">
                    {s.successCount}/{s.orderCount} · {formatNaira(s.volumeKobo)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Provider performance */}
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="mb-4 font-heading font-semibold text-secondary">Provider Fulfillment</h2>
          {providerPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No successful orders yet.</p>
          ) : (
            <div className="space-y-3">
              {providerPerformance.map((p) => (
                <div key={p.providerKey} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-secondary">{p.providerKey}</span>
                  <span className="text-muted-foreground">{p.fulfilledCount} orders fulfilled</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  danger,
  wide,
}: {
  label: string
  value: string
  accent?: boolean
  danger?: boolean
  wide?: boolean
}) {
  return (
    <div className={`rounded-lg border border-border bg-white p-4 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-heading font-bold ${
          danger ? "text-destructive" : accent ? "text-accent" : "text-secondary"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
