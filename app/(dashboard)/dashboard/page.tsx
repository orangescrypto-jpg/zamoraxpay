// app/(dashboard)/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Smartphone,
  Wifi,
  Tv,
  Zap,
  GraduationCap,
  Dices,
  Ticket,
  Wallet,
  ArrowDownToLine,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Gift,
  Users,
  Banknote,
  Globe,
  PartyPopper,
  Search,
  Star,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { DashboardAnnouncement } from "@/components/dashboard/DashboardAnnouncement"
import {
  DashboardPopupAnnouncement,
  type AnnouncementPopupState,
} from "@/components/dashboard/DashboardPopupAnnouncement"
import { SpinCard } from "@/components/dashboard/SpinCard"
import { SpinPopup } from "@/components/dashboard/SpinPopup"
import { useSpinStatus } from "@/components/dashboard/useSpinStatus"
import { ReceiptButton } from "@/components/dashboard/ReceiptButton"
import { Skeleton } from "@/components/ui/skeleton"

interface Order {
  id: string
  service_type: string
  network_or_biller: string
  amount_kobo: number
  display_amount_kobo?: number
  is_free_prize?: boolean
  status: string
  created_at: string
}

interface WalletTx {
  id: string
  type: string
  direction: "credit" | "debit"
  amount_kobo: number
  created_at: string
}

type ActivityItem =
  | { kind: "order"; id: string; created_at: string; data: Order }
  | { kind: "wallet"; id: string; created_at: string; data: WalletTx }


const QUICK_LINKS: { href: string; label: string; icon: LucideIcon; iconClass: string }[] = [
  { href: "/dashboard/services/airtime", label: "Airtime", icon: Smartphone, iconClass: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/services/data", label: "Data", icon: Wifi, iconClass: "bg-violet-50 text-violet-600" },
  { href: "/dashboard/services/cable", label: "Cable TV", icon: Tv, iconClass: "bg-orange-50 text-orange-600" },
  { href: "/dashboard/services/electricity", label: "Electricity", icon: Zap, iconClass: "bg-amber-50 text-amber-600" },
  { href: "/dashboard/services/exam-pin", label: "Exam PIN", icon: GraduationCap, iconClass: "bg-emerald-50 text-emerald-600" },
  { href: "/dashboard/services/epin", label: "ePIN", icon: Ticket, iconClass: "bg-fuchsia-50 text-fuchsia-600" },
  { href: "/dashboard/services/betting", label: "Betting", icon: Dices, iconClass: "bg-rose-50 text-rose-600" },
  { href: "/dashboard/services/international-topup", label: "International Top-up", icon: Globe, iconClass: "bg-cyan-50 text-cyan-600" },
  { href: "/dashboard/services/bulk-data", label: "Bulk Data", icon: Users, iconClass: "bg-indigo-50 text-indigo-600" },
  { href: "/dashboard/services/bulk-airtime", label: "Bulk Airtime", icon: Users, iconClass: "bg-sky-50 text-sky-600" },
  { href: "/dashboard/services/airtime-to-cash", label: "Airtime to Cash", icon: Banknote, iconClass: "bg-lime-50 text-lime-600" },
  { href: "/rewards", label: "Rewards", icon: Gift, iconClass: "bg-teal-50 text-teal-600" },
  { href: "/play", label: "Play & Earn", icon: PartyPopper, iconClass: "bg-purple-50 text-purple-600" },
]

const STATUS_STYLES: Record<string, { badge: string; icon: LucideIcon; iconClass: string }> = {
  success: { badge: "text-emerald-700 bg-emerald-50", icon: CheckCircle2, iconClass: "text-emerald-600 bg-emerald-50" },
  failed: { badge: "text-red-700 bg-red-50", icon: XCircle, iconClass: "text-red-600 bg-red-50" },
}

function statusStyle(status: string) {
  return (
    STATUS_STYLES[status] ?? {
      badge: "text-amber-700 bg-amber-50",
      icon: Clock,
      iconClass: "text-amber-600 bg-amber-50",
    }
  )
}

const WALLET_LABELS: Record<string, string> = {
  funding: "Wallet funding",
  refund: "Refund",
  cashback: "Cashback",
  referral_bonus: "Referral bonus",
  daily_streak: "Daily check-in reward",
  spin_reward: "Spin & Win prize",
  reseller_upgrade: "Reseller upgrade",
  admin_adjustment: "Wallet adjustment",
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [quickActionQuery, setQuickActionQuery] = useState("")
  const [pinnedQuickLinks, setPinnedQuickLinks] = useState<string[]>([])
  const [quickLinkOrder, setQuickLinkOrder] = useState<string[]>([])
  const [manageQuickActions, setManageQuickActions] = useState(false)
  const [canCheckInToday, setCanCheckInToday] = useState(false)
  const [nextRewardKobo, setNextRewardKobo] = useState(0)
  const [streakLoaded, setStreakLoaded] = useState(false)
  const spin = useSpinStatus()
  const [announcementPopupState, setAnnouncementPopupState] = useState<AnnouncementPopupState>("checking")

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("zamoraxpay:pinned-quick-actions") || "[]")
      if (Array.isArray(saved)) setPinnedQuickLinks(saved.filter((value): value is string => typeof value === "string" && QUICK_LINKS.some((link) => link.href === value)).slice(0, QUICK_LINKS.length))
      const savedOrder = JSON.parse(window.localStorage.getItem("zamoraxpay:quick-action-order") || "[]")
      if (Array.isArray(savedOrder)) setQuickLinkOrder(savedOrder.filter((value): value is string => typeof value === "string" && QUICK_LINKS.some((link) => link.href === value)))
    } catch {
      setPinnedQuickLinks([])
      setQuickLinkOrder([])
    }
  }, [])

  function toggleQuickLink(href: string) {
    setPinnedQuickLinks((previous) => {
      const next = previous.includes(href) ? previous.filter((value) => value !== href) : [href, ...previous]
      try { window.localStorage.setItem("zamoraxpay:pinned-quick-actions", JSON.stringify(next)) } catch {}
      return next
    })
  }

  function moveQuickLink(href: string, direction: -1 | 1) {
    const current = QUICK_LINKS.map((link) => link.href)
    const ordered = [...current].sort((a, b) => {
      const ai = quickLinkOrder.indexOf(a)
      const bi = quickLinkOrder.indexOf(b)
      return (ai < 0 ? current.indexOf(a) + current.length : ai) - (bi < 0 ? current.indexOf(b) + current.length : bi)
    })
    const index = ordered.indexOf(href)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setQuickLinkOrder(ordered)
    try { window.localStorage.setItem("zamoraxpay:quick-action-order", JSON.stringify(ordered)) } catch { /* local preferences are optional */ }
  }

  const visibleQuickLinks = QUICK_LINKS
    .filter((link) => `${link.label} ${link.href}`.toLowerCase().includes(quickActionQuery.trim().toLowerCase()))
    .sort((a, b) => {
      const pinDifference = Number(pinnedQuickLinks.includes(b.href)) - Number(pinnedQuickLinks.includes(a.href))
      if (pinDifference) return pinDifference
      const base = QUICK_LINKS.map((link) => link.href)
      const aIndex = quickLinkOrder.indexOf(a.href)
      const bIndex = quickLinkOrder.indexOf(b.href)
      return (aIndex < 0 ? base.indexOf(a.href) + base.length : aIndex) - (bIndex < 0 ? base.indexOf(b.href) + base.length : bIndex)
    })

  const recentServices = activity
    .filter((item): item is Extract<ActivityItem, { kind: "order" }> => item.kind === "order")
    .map((item) => {
      const service = item.data.service_type.toLowerCase().replace(/\s+/g, "_")
      const path = ({ airtime: "/dashboard/services/airtime", data: "/dashboard/services/data", cable: "/dashboard/services/cable", electricity: "/dashboard/services/electricity", exam_pin: "/dashboard/services/exam-pin", epin: "/dashboard/services/epin", betting: "/dashboard/services/betting", bulk_data: "/dashboard/services/bulk-data", bulk_airtime: "/dashboard/services/bulk-airtime" } as Record<string, string>)[service]
      return path ? QUICK_LINKS.find((link) => link.href === path) : undefined
    })
    .filter((link): link is (typeof QUICK_LINKS)[number] => Boolean(link))
    .filter((link, index, list) => list.findIndex((candidate) => candidate.href === link.href) === index)
    .slice(0, 3)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error("Your session could not be verified. Please sign in again.")
        const headers = { Authorization: `Bearer ${session.access_token}` }

        const res = await fetch("/api/dashboard/summary", { headers })
        if (!res.ok) throw new Error("We could not load your wallet summary. Please try again.")
        const data = await res.json()
        if (cancelled) return

        setBalanceKobo(data.balanceKobo ?? 0)
        setCanCheckInToday(Boolean(data.streak?.canCheckInToday))
        setNextRewardKobo(data.streak?.nextRewardKobo ?? 0)
        setStreakLoaded(true)

        const orders: Order[] = data.orders ?? []
        const walletTransactions: WalletTx[] = data.walletTransactions ?? []

        // Purchases already appear as an order row, so skip the paired
        // "purchase" wallet_transactions row here to avoid double-listing
        // the same event - everything else (funding, refunds, cashback,
        // bonuses, admin adjustments) is wallet-only and shown as-is.
        const merged: ActivityItem[] = [
          ...orders.map((o): ActivityItem => ({ kind: "order", id: o.id, created_at: o.created_at, data: o })),
          ...walletTransactions
            .filter((w) => w.type !== "purchase")
            .map((w): ActivityItem => ({ kind: "wallet", id: w.id, created_at: w.created_at, data: w })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setActivity(merged.slice(0, 5))
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "We could not load your dashboard. Please try again.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [retryCount])

  const firstName = user?.fullName?.split(" ")[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-secondary">{greeting}{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="mt-0.5 text-[1.65rem] font-semibold tracking-tight text-primary">
            Your wallet
          </h1>
        </div>
      </div>

      {/* Balance card - the one bold move on this page */}
      <div className="relative mt-5 overflow-hidden rounded-[20px] bg-[#0F1E4D] p-6 text-white shadow-[0_20px_40px_-16px_rgba(15,30,77,0.55)] sm:p-7">
        <svg
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 opacity-[0.16]"
          viewBox="0 0 200 200"
        >
          <circle cx="100" cy="100" r="99" fill="none" stroke="white" strokeWidth="1" />
          <circle cx="100" cy="100" r="74" fill="none" stroke="white" strokeWidth="1" />
          <circle cx="100" cy="100" r="49" fill="none" stroke="white" strokeWidth="1" />
        </svg>

        <div className="relative flex items-center gap-2 text-[13px] font-medium text-white/60">
          <Wallet className="h-3.5 w-3.5" />
          Wallet balance
        </div>
        <p className="relative mt-2 font-[600] text-[2.5rem] leading-none tracking-tight tabular-nums sm:text-[2.75rem]">
          {loading ? (
            <span className="inline-block h-9 w-40 animate-pulse rounded-md bg-white/10 align-middle" aria-label="Loading wallet balance" />
          ) : loadError ? (
            <span className="text-lg font-medium">Balance unavailable</span>
          ) : (
            formatNaira(balanceKobo ?? 0)
          )}
        </p>

        <div className="relative mt-6 flex items-center gap-2.5">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0F1E4D] transition hover:bg-blue-50"
          >
            <Wallet className="h-4 w-4" />
            Fund wallet
          </Link>
          <Link
            href="/rewards"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
          >
            <Gift className="h-4 w-4" />
            Rewards
          </Link>
        </div>
      </div>

      {streakLoaded && canCheckInToday && (
        <Link
          href="/daily-streak"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-teal-200/70 bg-teal-50 px-4 py-3.5 text-sm text-teal-900 transition hover:bg-teal-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <Gift className="h-4.5 w-4.5" />
          </span>
          <span className="flex-1">
            Check in today to earn{" "}
            <span className="font-semibold">{formatNaira(nextRewardKobo)}</span> and keep your streak going.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-teal-600" />
        </Link>
      )}

      {user && !user.hasTransactionPin && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-500" />
          <p>
            You haven't set a transaction PIN yet.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Set it up in Settings
            </Link>{" "}
            to start making purchases.
          </p>
        </div>
      )}

      <DashboardAnnouncement />
      {/* Spin card: always directly below the announcement banner, above Quick actions. */}
      <SpinCard spin={spin} />
      <DashboardPopupAnnouncement onStateChange={setAnnouncementPopupState} />
      {/* Spin popup waits until the announcement popup is closed so they never stack. */}
      <SpinPopup spin={spin} blocked={announcementPopupState !== "closed"} />

      <div className="mt-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-primary">Quick actions</h2>
            <p className="mt-1 text-xs text-muted-foreground">Pin the services you use most. Your choices stay on this device.</p>
          </div>
          <div className="flex items-center gap-2">
            {pinnedQuickLinks.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">{pinnedQuickLinks.length} pinned</span>}
            <button type="button" onClick={() => setManageQuickActions((value) => !value)} aria-pressed={manageQuickActions} className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-secondary hover:border-primary hover:text-primary">{manageQuickActions ? "Done" : "Reorder"}</button>
          </div>
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={quickActionQuery} onChange={(event) => setQuickActionQuery(event.target.value)} placeholder="Find a service or action" aria-label="Search quick actions" className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
        </label>
        {visibleQuickLinks.length > 0 ? <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleQuickLinks.map((link) => {
            const Icon = link.icon
            const showBadge = link.href === "/play" && (spin.status?.tickets.length ?? 0) > 0
            const isPinned = pinnedQuickLinks.includes(link.href)
            return (
              <div key={link.href} className="relative min-w-0">
                <Link href={link.href} className="group flex min-h-[118px] h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-white px-3 py-4 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_20px_-10px_rgba(15,30,77,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  {showBadge && <span className="absolute right-3 top-3 flex h-2.5 w-2.5 rounded-full bg-red-500" aria-label="New activity" />}
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full transition group-hover:scale-105 ${link.iconClass}`}><Icon className="h-5 w-5" /></span>
                  <span className="text-sm font-medium leading-tight text-secondary group-hover:text-primary">{link.label}</span>
                </Link>
                {manageQuickActions && <div className="absolute bottom-2 right-2 z-10 flex gap-1">
                  <button type="button" onClick={() => moveQuickLink(link.href, -1)} disabled={visibleQuickLinks[0]?.href === link.href} aria-label={`Move ${link.label} earlier`} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-secondary shadow-sm disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => moveQuickLink(link.href, 1)} disabled={visibleQuickLinks[visibleQuickLinks.length - 1]?.href === link.href} aria-label={`Move ${link.label} later`} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-secondary shadow-sm disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>}
                <button type="button" onClick={() => toggleQuickLink(link.href)} aria-label={`${isPinned ? "Unpin" : "Pin"} ${link.label}`} aria-pressed={isPinned} title={isPinned ? "Unpin shortcut" : "Pin shortcut"} className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isPinned ? "border-amber-200 bg-amber-50 text-amber-700" : "border-border bg-white/95 text-muted-foreground hover:text-amber-600"}`}><Star className={`h-4 w-4 ${isPinned ? "fill-current" : ""}`} /></button>
              </div>
            )
          })}
        </div> : <div className="mt-3 rounded-2xl border border-dashed border-border bg-white px-5 py-8 text-center"><p className="text-sm font-medium text-secondary">No matching actions</p><p className="mt-1 text-xs text-muted-foreground">Try another service name.</p><button type="button" onClick={() => setQuickActionQuery("")} className="mt-3 text-xs font-semibold text-primary hover:underline">Clear search</button></div>}
      </div>

      {recentServices.length > 0 && !loading && (
        <section className="mt-5 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="recent-services-title">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="recent-services-title" className="text-sm font-semibold text-secondary">Recently used</h2><p className="mt-1 text-xs text-muted-foreground">Quickly return to a service from your recent activity.</p></div>
            <Link href="/history" className="text-xs font-semibold text-primary hover:underline">View history</Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {recentServices.map((link) => { const Icon = link.icon; return <Link key={link.href} href={link.href} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-card px-2 py-3 text-center transition hover:border-primary/40 hover:bg-primary/5"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${link.iconClass}`}><Icon className="h-4 w-4" /></span><span className="text-xs font-medium leading-tight text-secondary">{link.label}</span></Link> })}
          </div>
        </section>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/history"
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Clock className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-secondary">Need a past receipt?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Open your full transaction history.</span>
          </span>
          <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/contact"
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-secondary">Need help?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Get support without leaving your account.</span>
          </span>
          <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {loadError && (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-red-700 px-3 py-2 font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Retrying..." : "Try again"}
          </button>
        </div>
      )}

      <div className="mt-9">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-primary">Recent transactions</h2>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3.5 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {loading ? (
            <div className="divide-y divide-border/70" aria-busy="true" aria-label="Loading recent transactions">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Your recent activity is temporarily unavailable.</div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">No transactions yet — fund your wallet to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {activity.map((item) => {
                if (item.kind === "order") {
                  const order = item.data
                  const { badge, icon: StatusIcon, iconClass } = statusStyle(order.status)
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
                        <StatusIcon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-primary">
                          {order.service_type} · {order.network_or_biller}
                        </p>
                        <p className="text-xs text-secondary">
                          {new Date(order.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13.5px] font-medium tabular-nums text-primary">
                          {formatNaira(order.display_amount_kobo ?? order.amount_kobo)}
                        </p>
                        {order.is_free_prize && (
                          <p className="text-[11px] font-medium text-accent">Free prize</p>
                        )}
                        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}>
                          {order.status}
                        </span>
                        <ReceiptButton
                          service={`${order.service_type} · ${order.network_or_biller}`}
                          reference={order.id}
                          amount={formatNaira(order.display_amount_kobo ?? order.amount_kobo)}
                          status={order.status}
                          date={new Date(order.created_at).toLocaleString()}
                        />
                      </div>
                    </div>
                  )
                }

                const tx = item.data
                const isCredit = tx.direction === "credit"
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isCredit ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"
                      }`}
                    >
                      {isCredit ? <ArrowDownToLine className="h-4.5 w-4.5" /> : <Wallet className="h-4.5 w-4.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-primary">
                        {WALLET_LABELS[tx.type] ?? tx.type}
                      </p>
                      <p className="text-xs text-secondary">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[13.5px] font-medium tabular-nums ${isCredit ? "text-emerald-700" : "text-primary"}`}>
                        {isCredit ? "+" : "-"}
                        {formatNaira(tx.amount_kobo)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
