// app/(admin)/admin/transactions/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface OrderRow {
  id: string
  user_id: string
  service_type: string
  network_or_biller: string
  recipient: string
  amount_kobo: number
  provider_used: string | null
  status: string
  failure_reason: string | null
  created_at: string
}

export default function AdminTransactionsPage() {
  const [tab, setTab] = useState<"orders" | "wallet">("orders")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const params = new URLSearchParams({ type: tab })
    if (statusFilter) params.set("status", statusFilter)
    const res = await fetch(`/api/admin/transactions?${params}`, { headers })
    const data = await res.json()
    setRows(tab === "orders" ? data.orders ?? [] : data.transactions ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter])

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Transactions</h1>

      <div className="mb-4 flex items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setTab("orders")}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === "orders" ? "bg-white shadow-sm" : "text-muted-foreground")}
          >
            VTU Orders
          </button>
          <button
            onClick={() => setTab("wallet")}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === "wallet" ? "bg-white shadow-sm" : "text-muted-foreground")}
          >
            Wallet Ledger
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {tab === "orders" ? (
            <>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </>
          ) : (
            <>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="reversed">Reversed</option>
            </>
          )}
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              {tab === "orders" ? (
                <tr>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border">
              {tab === "orders"
                ? (rows as OrderRow[]).map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3 capitalize">{o.service_type.replace("_", " ")} — {o.network_or_biller}</td>
                      <td className="px-4 py-3">{o.recipient}</td>
                      <td className="px-4 py-3">{formatNaira(o.amount_kobo)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.provider_used ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            o.status === "success" && "bg-accent/10 text-accent",
                            o.status === "failed" && "bg-destructive/10 text-destructive",
                            o.status === "pending" && "bg-muted text-muted-foreground",
                            o.status === "refunded" && "bg-primary/10 text-primary",
                          )}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                    </tr>
                  ))
                : rows.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 capitalize">{t.type.replace("_", " ")}</td>
                      <td className="px-4 py-3 capitalize">{t.direction}</td>
                      <td className="px-4 py-3">{formatNaira(t.amount_kobo)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.reference}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            t.status === "completed" && "bg-accent/10 text-accent",
                            t.status === "failed" && "bg-destructive/10 text-destructive",
                            t.status === "reversed" && "bg-primary/10 text-primary",
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.created_at)}</td>
                    </tr>
                  ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No records found.
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
