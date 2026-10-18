// app/(admin)/admin/page.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again to view analytics.")

      const response = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error(`Analytics could not be loaded (${response.status}). Please try again.`)
      const result = await response.json()
      if (!result?.overview || !Array.isArray(result.serviceBreakdown) || !Array.isArray(result.dailyVolume) || !Array.isArray(result.providerPerformance)) {
        throw new Error("The analytics response was incomplete. Please try again.")
      }
      setData(result as AnalyticsData)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analytics could not be loaded. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  if (loading && !data) {
    return <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8" aria-label="Loading admin dashboard">
      <div className="h-28 animate-pulse rounded-2xl bg-muted"/><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="h-24 animate-pulse rounded-xl bg-muted"/><div className="h-24 animate-pulse rounded-xl bg-muted"/><div className="h-24 animate-pulse rounded-xl bg-muted"/><div className="h-24 animate-pulse rounded-xl bg-muted"/></div><div className="h-64 animate-pulse rounded-2xl bg-muted"/>
    </main>
  }

  if (!data) return <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8"><section className="rounded-2xl border border-destructive/25 bg-card p-6 text-center sm:p-10"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-xl text-destructive" aria-hidden>!</div><h1 className="mt-4 text-xl font-heading font-bold text-foreground">Dashboard unavailable</h1><p role="alert" className="mt-2 text-sm leading-6 text-muted-foreground">{error || "We could not load the dashboard data."}</p><button type="button" onClick={() => void loadAnalytics()} className="mt-5 min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition hover:opacity-90">Try again</button></section></main>

  const { overview, serviceBreakdown, dailyVolume, providerPerformance } = data
  const maxDailyVolume = Math.max(...dailyVolume.map((day) => day.volumeKobo), 1)
  const stats: Array<{ label: string; value: string; tone?: string; wide?: boolean }> = [
    { label: "Total users", value: overview.totalUsers.toLocaleString() },
    { label: "Active users", value: overview.activeUsers.toLocaleString(), tone: "good" },
    { label: "Resellers", value: overview.resellerUsers.toLocaleString() },
    { label: "Suspended or frozen", value: overview.suspendedUsers.toLocaleString(), tone: overview.suspendedUsers > 0 ? "danger" : "normal" },
    { label: "Total orders", value: overview.totalOrders.toLocaleString() },
    { label: "Successful orders", value: overview.successfulOrders.toLocaleString(), tone: "good" },
    { label: "Failed orders", value: overview.failedOrders.toLocaleString(), tone: overview.failedOrders > 0 ? "danger" : "normal" },
    { label: "Pending orders", value: overview.pendingOrders.toLocaleString() },
    { label: "Successful volume", value: formatNaira(overview.successfulVolumeKobo), wide: true },
    { label: "Wallet balances held", value: formatNaira(overview.totalWalletBalanceKobo), wide: true },
    { label: "Orders today", value: overview.ordersToday.toLocaleString() },
    { label: "Volume today", value: formatNaira(overview.volumeTodayKobo) },
    { label: "New users today", value: overview.newUsersToday.toLocaleString() },
    { label: "New users this week", value: overview.newUsersThisWeek.toLocaleString() },
    ...(overview.openFraudFlags > 0 ? [{ label: "Open fraud flags", value: overview.openFraudFlags.toLocaleString(), tone: "danger", wide: true }] : []),
  ]

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary to-secondary/90 p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Operations overview</p><h1 className="mt-2 text-2xl font-heading font-bold sm:text-3xl">Admin dashboard</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/70">A clear view of platform activity, transaction outcomes, and service performance.</p></div>
          <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-white/60">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Live summary"}</span><button type="button" disabled={loading} onClick={() => void loadAnalytics()} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60">{loading ? "Refreshing..." : "Refresh data"}</button></div>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"><p>{error} Previously loaded figures remain visible.</p><button type="button" onClick={() => void loadAnalytics()} className="min-h-9 rounded-lg border border-current/20 px-3 font-semibold">Try again</button></div>}

      <section aria-label="Platform metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {stats.map((stat) => <div key={stat.label} className={`min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${stat.wide ? "col-span-2" : ""}`}><p className="text-xs font-medium leading-5 text-muted-foreground">{stat.label}</p><p className={`mt-2 break-words text-xl font-heading font-bold sm:text-2xl ${stat.tone === "danger" ? "text-destructive" : stat.tone === "good" ? "text-accent" : "text-foreground"}`}>{stat.value}</p></div>)}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold text-foreground">Order volume</h2><p className="mt-1 text-sm text-muted-foreground">Daily successful transaction value over the last 14 days</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Last 14 days</span></div>
        {dailyVolume.length === 0 ? <EmptyState title="No order activity yet" description="Daily volume will appear here when orders are recorded."/> : <><div className="flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="Bar chart showing daily order volume for the last 14 days">{dailyVolume.map((day) => <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${day.date}: ${formatNaira(day.volumeKobo)}, ${day.orderCount} orders`}><div className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max((day.volumeKobo / maxDailyVolume) * 140, 3)}px` }}/></div>)}</div><div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground sm:text-xs"><span>{dailyVolume[0]?.date}</span><span>{dailyVolume[dailyVolume.length - 1]?.date}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Orders represented</p><p className="mt-1 font-semibold text-foreground">{dailyVolume.reduce((total, day) => total + day.orderCount, 0).toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Volume represented</p><p className="mt-1 font-semibold text-foreground">{formatNaira(dailyVolume.reduce((total, day) => total + day.volumeKobo, 0))}</p></div><div className="col-span-2 sm:col-span-1"><p className="text-xs text-muted-foreground">Peak day</p><p className="mt-1 font-semibold text-foreground">{[...dailyVolume].sort((a, b) => b.volumeKobo - a.volumeKobo)[0]?.date ?? "Not available"}</p></div></div></>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"><div className="mb-4"><h2 className="font-heading text-lg font-semibold text-foreground">Service breakdown</h2><p className="mt-1 text-sm text-muted-foreground">Order volume and successful fulfilment by service</p></div>{serviceBreakdown.length === 0 ? <EmptyState title="No service data yet" description="Service performance will appear here when orders are available."/> : <div className="space-y-4">{serviceBreakdown.map((service) => { const rate = service.orderCount > 0 ? Math.round((service.successCount / service.orderCount) * 100) : 0; return <div key={service.serviceType}><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium capitalize text-foreground">{service.serviceType.replace(/_/g, " ")}</span><span className="text-right text-xs text-muted-foreground">{service.successCount}/{service.orderCount} successful <span className="mx-1">·</span>{formatNaira(service.volumeKobo)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, rate)}%` }}/></div></div>})}</div>}</div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"><div className="mb-4"><h2 className="font-heading text-lg font-semibold text-foreground">Provider fulfilment</h2><p className="mt-1 text-sm text-muted-foreground">Successful orders completed by provider</p></div>{providerPerformance.length === 0 ? <EmptyState title="No provider data yet" description="Provider fulfilment details will appear here when available."/> : <div className="space-y-3">{providerPerformance.map((provider) => <div key={provider.providerKey} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-3"><div className="min-w-0"><p className="truncate font-medium capitalize text-foreground">{provider.providerKey.replace(/[_-]/g, " ")}</p><p className="mt-1 text-xs text-muted-foreground">Fulfilled orders</p></div><p className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent">{provider.fulfilledCount.toLocaleString()}</p></div>)}</div>}</div>
      </section>
    </main>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center"><p className="font-medium text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
}
