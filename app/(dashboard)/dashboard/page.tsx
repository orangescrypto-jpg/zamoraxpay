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
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface Order {
  id: string
  service_type: string
  network_or_biller: string
  amount_kobo: number
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
  { href: "/services/airtime", label: "Airtime", icon: Smartphone, iconClass: "bg-blue-50 text-blue-600" },
  { href: "/services/data", label: "Data", icon: Wifi, iconClass: "bg-violet-50 text-violet-600" },
  { href: "/services/cable", label: "Cable TV", icon: Tv, iconClass: "bg-orange-50 text-orange-600" },
  { href: "/services/electricity", label: "Electricity", icon: Zap, iconClass: "bg-amber-50 text-amber-600" },
  { href: "/services/exam-pin", label: "Exam PIN", icon: GraduationCap, iconClass: "bg-emerald-50 text-emerald-600" },
  { href: "/services/epin", label: "ePIN", icon: Ticket, iconClass: "bg-fuchsia-50 text-fuchsia-600" },
  { href: "/services/betting", label: "Betting", icon: Dices, iconClass: "bg-rose-50 text-rose-600" },
  { href: "/services/bulk-data", label: "Bulk Data", icon: Users, iconClass: "bg-indigo-50 text-indigo-600" },
  { href: "/services/bulk-airtime", label: "Bulk Airtime", icon: Users, iconClass: "bg-sky-50 text-sky-600" },
  { href: "/services/airtime-to-cash", label: "Airtime to Cash", icon: Banknote, iconClass: "bg-lime-50 text-lime-600" },
  { href: "/rewards", label: "Rewards", icon: Gift, iconClass: "bg-teal-50 text-teal-600" },
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
  reseller_upgrade: "Reseller upgrade",
  admin_adjustment: "Wallet adjustment",
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [canCheckInToday, setCanCheckInToday] = useState(false)
  const [nextRewardKobo, setNextRewardKobo] = useState(0)
  const [streakLoaded, setStreakLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const headers = { Authorization: `Bearer ${session?.access_token}` }

        const [balanceRes, historyRes] = await Promise.all([
          fetch("/api/wallet/balance", { headers }),
          fetch("/api/history", { headers }),
        ])
        const balanceData = await balanceRes.json()
        const historyData = await historyRes.json()
        if (cancelled) return

        setBalanceKobo(balanceData.balanceKobo ?? 0)

        // Independent of the above — a failure here shouldn't block
        // balance/history from rendering, so it's fetched separately.
        fetch("/api/daily-streak", { headers })
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) return
            setCanCheckInToday(Boolean(data.canCheckInToday))
            setNextRewardKobo(data.nextRewardKobo ?? 0)
            setStreakLoaded(true)
          })
          .catch(() => { if (!cancelled) setStreakLoaded(true) /* notice just stays hidden */ })

        const orders: Order[] = historyData.orders ?? []
        const walletTransactions: WalletTx[] = historyData.walletTransactions ?? []

        // Purchases already appear as an order row, so skip the paired
        // "purchase" wallet_transactions row here to avoid double-listing
        // the same event — everything else (funding, refunds, cashback,
        // bonuses, admin adjustments) is wallet-only and shown as-is.
        const merged: ActivityItem[] = [
          ...orders.map((o): ActivityItem => ({ kind: "order", id: o.id, created_at: o.created_at, data: o })),
          ...walletTransactions
            .filter((w) => w.type !== "purchase")
            .map((w): ActivityItem => ({ kind: "wallet", id: w.id, created_at: w.created_at, data: w })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setActivity(merged.slice(0, 5))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

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

      {/* Balance card — the one bold move on this page */}
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
            <span className="inline-block h-9 w-40 animate-pulse rounded-md bg-white/10 align-middle" />
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


      <div className="mt-9">
        <h2 className="text-[15px] font-semibold text-primary">Quick actions</h2>

        <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border/70 bg-white px-4 py-5 text-center transition hover:border-blue-200 hover:shadow-[0_4px_16px_-6px_rgba(15,30,77,0.18)]"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-full transition group-hover:scale-105 ${link.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium leading-tight text-secondary group-hover:text-primary">
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

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

        <div className="mt-3.5 overflow-hidden rounded-2xl border border-border/70 bg-white">
          {loading ? (
            <div className="divide-y divide-border/70">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <span className="block h-3 w-32 animate-pulse rounded bg-gray-100" />
                    <span className="block h-2.5 w-20 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50">
                <Clock className="h-5 w-5 text-gray-300" />
              </span>
              <p className="text-sm text-secondary">No transactions yet — fund your wallet to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {activity.map((item) => {
                if (item.kind === "order") {
                  const order = item.data
                  const { badge, icon: StatusIcon, iconClass } = statusStyle(order.status)
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-gray-50/70">
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
                          {formatNaira(order.amount_kobo)}
                        </p>
                        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  )
                }

                const tx = item.data
                const isCredit = tx.direction === "credit"
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-gray-50/70">
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
