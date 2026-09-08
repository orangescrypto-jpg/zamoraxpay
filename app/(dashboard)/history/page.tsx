// app/(dashboard)/history/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface OrderRow {
  id: string
  service_type: string
  network_or_biller: string
  recipient: string
  amount_kobo: number
  status: string
  created_at: string
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

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
        setOrders(data.orders ?? [])
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
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">No transactions yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium capitalize text-secondary">
                  {order.service_type.replace("_", " ")} — {order.network_or_biller}
                </p>
                <p className="text-xs text-muted-foreground">{order.recipient}</p>
                <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-secondary">{formatNaira(order.amount_kobo)}</p>
                <span
                  className={`text-xs font-medium capitalize ${
                    order.status === "success"
                      ? "text-accent"
                      : order.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
