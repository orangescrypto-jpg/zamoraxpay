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
  Wallet,
  ArrowDownToLine,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Gift,
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
  { href: "/services/betting", label: "Betting", icon: Dices, iconClass: "bg-rose-50 text-rose-600" },
  { href: "/referrals", label: "Refer & Earn", icon: Gift, iconClass: "bg-teal-50 text-teal-600" },
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
  reseller_upgrade: "Reseller upgrade",
  admin_adjustment: "Wallet adjustment",
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">
        Welcome back{user?.fullName ? `, ${user.fullName}` : ""}
      </h1>

      <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white shadow-lg shadow-blue-900/10">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-100">
          <Wallet className="h-4 w-4" />
          Wallet balance
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight">
          {loading ? "…" : formatNaira(balanceKobo ?? 0)}
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Wallet className="h-4 w-4" />
            Fund wallet
          </Link>
          <Link
            href="/withdraw"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Withdraw
          </Link>
        </div>
      </div>

      {user && !user.hasTransactionPin && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p>
            You haven't set a transaction PIN yet.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Set it up in Settings
            </Link>{" "}
            to start making purchases.
          </p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Quick actions</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col items-center gap-2.5 rounded-xl border border-border bg-white px-4 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${link.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-secondary group-hover:text-primary">
                  {link.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">Recent transactions</h2>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-sm text-secondary">Loading…</p>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Clock className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-secondary">No transactions yet.</p>
            </div>
          ) : (
            activity.map((item) => {
              if (item.kind === "order") {
                const order = item.data
                const { badge, icon: StatusIcon, iconClass } = statusStyle(order.status)
                return (
                  <div key={item.id} className="flex items-center gap-3 p-4">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
                      <StatusIcon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">
                        {order.service_type} · {order.network_or_biller}
                      </p>
                      <p className="text-xs text-secondary">
                        {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-primary">
                        {formatNaira(order.amount_kobo)}
                      </p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                )
              }

              const tx = item.data
              const isCredit = tx.direction === "credit"
              return (
                <div key={item.id} className="flex items-center gap-3 p-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isCredit ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"
                    }`}
                  >
                    {isCredit ? <ArrowDownToLine className="h-4.5 w-4.5" /> : <Wallet className="h-4.5 w-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">
                      {WALLET_LABELS[tx.type] ?? tx.type}
                    </p>
                    <p className="text-xs text-secondary">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-medium ${isCredit ? "text-emerald-700" : "text-primary"}`}>
                      {isCredit ? "+" : "-"}
                      {formatNaira(tx.amount_kobo)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
