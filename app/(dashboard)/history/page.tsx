// app/(dashboard)/history/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface DeliveredPin {
  pin: string
  serialNumber?: string
}

interface OrderDeliveredData {
  pins?: DeliveredPin[]
  token?: string
  units?: string
  deliveryNote?: string
}

interface OrderRow {
  id: string
  service_type: string
  network_or_biller: string
  recipient: string
  amount_kobo: number
  status: string
  created_at: string
  delivered_data?: string | null // JSON string from D1 — parsed on render
}

interface WalletTransactionRow {
  id: string
  type: string
  direction: "credit" | "debit"
  amount_kobo: number
  status: string
  created_at: string
}

// A single row in the unified feed — either a VTU purchase order or a
// wallet-level transaction (funding, withdrawal, cashback, referral,
// refund, reseller upgrade, admin adjustment).
type FeedItem =
  | { kind: "order"; created_at: string; data: OrderRow }
  | { kind: "wallet"; created_at: string; data: WalletTransactionRow }

const WALLET_TYPE_LABELS: Record<string, string> = {
  funding: "Wallet Funding",
  purchase: "Purchase",
  refund: "Refund",
  cashback: "Cashback",
  referral_bonus: "Referral Bonus",
  reseller_upgrade: "Reseller Upgrade",
  admin_adjustment: "Adjustment",
}

function statusColor(status: string) {
  if (status === "success" || status === "completed") return "text-accent"
  if (status === "failed" || status === "reversed") return "text-destructive"
  return "text-muted-foreground"
}

export default function HistoryPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return setLoading(false)

      const res = await fetch("/api/history", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const orders: OrderRow[] = data.orders ?? []
        const walletTransactions: WalletTransactionRow[] = data.walletTransactions ?? []

        // Purchases already appear as vtu_orders rows, so skip the
        // matching 'purchase' wallet_transactions rows to avoid
        // showing the same purchase twice in the feed.
        const merged: FeedItem[] = [
          ...orders.map((o): FeedItem => ({ kind: "order", created_at: o.created_at, data: o })),
          ...walletTransactions
            .filter((w) => w.type !== "purchase")
            .map((w): FeedItem => ({ kind: "wallet", created_at: w.created_at, data: w })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setItems(merged)
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Transaction History</h1>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">No transactions yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            if (item.kind === "order") {
              const order = item.data
              let delivered: OrderDeliveredData | null = null
              if (order.delivered_data) {
                try { delivered = JSON.parse(order.delivered_data) } catch { delivered = null }
              }
              const hasDelivered = !!(delivered?.pins?.length || delivered?.token || delivered?.deliveryNote)
              const isExpanded = expandedOrderId === order.id

              return (
                <div key={`order-${order.id}`} className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => hasDelivered && setExpandedOrderId(isExpanded ? null : order.id)}
                    className={`flex w-full items-center justify-between p-4 text-left ${hasDelivered ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div>
                      <p className="text-sm font-medium capitalize text-secondary">
                        {order.service_type.replace("_", " ")} — {order.network_or_biller}
                      </p>
                      <p className="text-xs text-muted-foreground">{order.recipient}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                      {hasDelivered && (
                        <p className="mt-1 text-xs font-medium text-primary">
                          {isExpanded ? "Hide details ▲" : "View PIN/token ▼"}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-secondary">{formatNaira(order.amount_kobo)}</p>
                      <span className={`text-xs font-medium capitalize ${statusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                  </button>

                  {isExpanded && delivered && (
                    <div className="space-y-2 border-t border-border p-4">
                      {delivered.pins?.map((p, i) => (
                        <div key={i} className="rounded-md border border-border bg-muted/30 p-3 font-mono text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="tracking-widest">{p.pin}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(p.pin)}
                              className="shrink-0 rounded border border-border px-2 py-1 text-xs font-sans text-secondary hover:bg-muted"
                            >
                              Copy
                            </button>
                          </div>
                          {p.serialNumber && (
                            <p className="mt-1 text-xs font-sans text-secondary/70">Serial: {p.serialNumber}</p>
                          )}
                        </div>
                      ))}
                      {delivered.token && (
                        <div className="rounded-md border border-border bg-muted/30 p-3 font-mono text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="tracking-widest">{delivered.token}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(delivered!.token!)}
                              className="shrink-0 rounded border border-border px-2 py-1 text-xs font-sans text-secondary hover:bg-muted"
                            >
                              Copy
                            </button>
                          </div>
                          {delivered.units && (
                            <p className="mt-1 text-xs font-sans text-secondary/70">Units: {delivered.units}</p>
                          )}
                        </div>
                      )}
                      {delivered.deliveryNote && (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                          {delivered.deliveryNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            const tx = item.data
            const label = WALLET_TYPE_LABELS[tx.type] ?? tx.type.replace("_", " ")
            const sign = tx.direction === "credit" ? "+" : "-"
            return (
              <div key={`wallet-${tx.id}`} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium capitalize text-secondary">{label}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.direction === "credit" ? "text-accent" : "text-secondary"}`}>
                    {sign}{formatNaira(tx.amount_kobo)}
                  </p>
                  <span className={`text-xs font-medium capitalize ${statusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
