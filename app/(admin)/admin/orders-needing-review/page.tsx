// app/(admin)/admin/orders-needing-review/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface ReviewOrder {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string
  service_type: string
  network_or_biller: string
  recipient: string
  amount_kobo: number
  provider_attempts: string | null
  failure_reason: string
  created_at: string
}

export default function OrdersNeedingReviewPage() {
  const [orders, setOrders] = useState<ReviewOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/orders-needing-review", { headers })
    const data = await res.json()
    setOrders(data.orders ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function resolve(id: string, outcome: "delivered" | "failed_refund") {
    const confirmMsg =
      outcome === "delivered"
        ? "Confirm this order was actually delivered (checked on the provider's dashboard)? No refund will be issued."
        : "Confirm this order was NOT delivered? The customer's wallet will be refunded."
    if (!confirm(confirmMsg)) return

    const note = prompt("Optional note for the record (what you found on the provider dashboard):") ?? ""

    setProcessing(id)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/orders-needing-review/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ outcome, note }),
    })
    const data = await res.json()
    setProcessing(null)
    if (!res.ok) alert(data.error ?? "Failed to resolve order")
    else alert(data.message)
    load()
  }

  function attemptedProviders(order: ReviewOrder): string[] {
    if (!order.provider_attempts) return []
    try {
      const attempts = JSON.parse(order.provider_attempts)
      if (!Array.isArray(attempts)) return []
      return attempts.map((a: any) => a?.providerKey).filter(Boolean)
    } catch {
      return []
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-heading font-bold">Orders Needing Review</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Orders the reconcile cron could not resolve on its own after asking every provider it could — the
        customer&apos;s wallet is already debited for each of these. Check the provider&apos;s own dashboard using
        the reference shown, then mark the outcome.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders currently need review.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary">{o.full_name} · {o.phone}</p>
                  <p className="text-xs text-muted-foreground">{o.email} · {formatDate(o.created_at)}</p>
                </div>
                <p className="text-lg font-heading font-bold text-secondary">{formatNaira(o.amount_kobo)}</p>
              </div>

              <div className="mb-3 rounded-md bg-bg p-3 text-sm">
                <p><strong>Service:</strong> {o.service_type} — {o.network_or_biller}</p>
                <p><strong>Recipient:</strong> {o.recipient}</p>
                <p><strong>Reference:</strong> ZPORD-{o.id}</p>
                <p><strong>Attempted providers:</strong> {attemptedProviders(o).join(", ") || "none logged"}</p>
                <p className="mt-2 text-xs text-amber-700">{o.failure_reason}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => resolve(o.id, "delivered")}
                  disabled={processing === o.id}
                  className="rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-50"
                >
                  Confirmed delivered — no refund
                </button>
                <button
                  onClick={() => resolve(o.id, "failed_refund")}
                  disabled={processing === o.id}
                  className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-50"
                >
                  Confirmed not delivered — refund
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
