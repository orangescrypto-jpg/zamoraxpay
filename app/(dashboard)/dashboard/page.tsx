// app/(dashboard)/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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

const QUICK_LINKS = [
  { href: "/services/airtime", label: "Airtime" },
  { href: "/services/data", label: "Data" },
  { href: "/services/cable", label: "Cable TV" },
  { href: "/services/electricity", label: "Electricity" },
  { href: "/services/exam-pin", label: "Exam PIN" },
  { href: "/services/betting", label: "Betting" },
]

function statusColor(status: string) {
  switch (status) {
    case "success":
      return "text-emerald-600 bg-emerald-50"
    case "failed":
      return "text-red-600 bg-red-50"
    default:
      return "text-amber-600 bg-amber-50"
  }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
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
        setOrders((historyData.orders ?? []).slice(0, 5))
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

      <div className="mt-6 rounded-lg border border-border bg-white p-5">
        <p className="text-sm text-secondary">Wallet balance</p>
        <p className="mt-1 text-3xl font-bold text-primary">
          {loading ? "…" : formatNaira((balanceKobo ?? 0))}
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/wallet"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Fund wallet
          </Link>
          <Link
            href="/withdraw"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary hover:text-primary"
          >
            Withdraw
          </Link>
        </div>
      </div>

      {user && !user.hasTransactionPin && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          You haven't set a transaction PIN yet.{" "}
          <Link href="/settings" className="font-medium underline">
            Set it up in Settings
          </Link>{" "}
          to start making purchases.
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Quick actions</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border border-border bg-white px-4 py-3 text-center text-sm font-medium text-secondary hover:border-blue-300 hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">Recent transactions</h2>
          <Link href="/history" className="text-sm font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-white">
          {loading ? (
            <p className="p-4 text-sm text-secondary">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="p-4 text-sm text-secondary">No transactions yet.</p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-primary">
                    {order.service_type} · {order.network_or_biller}
                  </p>
                  <p className="text-xs text-secondary">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-primary">
                    {formatNaira(order.amount_kobo)}
                  </p>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColor(order.status)}`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
