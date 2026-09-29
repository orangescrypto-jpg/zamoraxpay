// app/(admin)/admin/transactions/page.tsx
"use client"

import { Fragment, useEffect, useState } from "react"
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
  display_amount_kobo?: number
  is_free_prize?: boolean
  provider_used: string | null
  status: string
  failure_reason: string | null
  provider_attempts: string | null
  created_at: string
}

function prettyAttempts(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function orderBadge(status: string) {
  return cn(
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
    status === "success" && "bg-accent/10 text-accent",
    status === "failed" && "bg-destructive/10 text-destructive",
    status === "pending" && "bg-muted text-muted-foreground",
    status === "refunded" && "bg-primary/10 text-primary",
  )
}

function walletBadge(status: string) {
  return cn(
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
    status === "completed" && "bg-accent/10 text-accent",
    status === "failed" && "bg-destructive/10 text-destructive",
    status === "reversed" && "bg-primary/10 text-primary",
  )
}

export default function AdminTransactionsPage() {
  const [tab, setTab] = useState<"orders" | "wallet">("orders")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const orders = rows as OrderRow[]

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-heading font-bold sm:mb-6 sm:text-2xl">Transactions</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => { setTab("orders"); setStatusFilter(""); setExpandedId(null) }}
            className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", tab === "orders" ? "bg-white shadow-sm" : "text-muted-foreground")}
          >
            VTU Orders
          </button>
          <button
            onClick={() => { setTab("wallet"); setStatusFilter(""); setExpandedId(null) }}
            className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", tab === "wallet" ? "bg-white shadow-sm" : "text-muted-foreground")}
          >
            Wallet Ledger
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-sm"
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
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-8 text-center text-muted-foreground">
          No records found.
        </div>
      ) : (
        <>
          {/* ───────── Mobile / small screens: stacked cards ───────── */}
          <div className="space-y-3 md:hidden">
            {tab === "orders"
              ? orders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border bg-white p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium capitalize">
                          {o.service_type.replace("_", " ")} — {o.network_or_biller}
                        </p>
                        <p className="mt-0.5 break-all text-muted-foreground">{o.recipient}</p>
                      </div>
                      <span className={orderBadge(o.status)}>{o.status}</span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Amount</dt>
                        <dd className="font-medium">{formatNaira(o.display_amount_kobo ?? o.amount_kobo)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Provider</dt>
                        <dd className="font-medium">{o.provider_used ?? "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Date</dt>
                        <dd>{formatDate(o.created_at)}</dd>
                      </div>
                    </dl>

                    {o.failure_reason && (
                      <p className="mt-3 break-words rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        {o.failure_reason}
                      </p>
                    )}

                    {o.provider_attempts && (
                      <>
                        <button
                          onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                          className="mt-3 text-xs font-medium text-primary hover:underline"
                        >
                          {expandedId === o.id ? "Hide provider attempts" : "View provider attempts"}
                        </button>
                        {expandedId === o.id && (
                          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                            {prettyAttempts(o.provider_attempts)}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                ))
              : rows.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border bg-white p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium capitalize">{t.type.replace("_", " ")}</p>
                      <span className={walletBadge(t.status)}>{t.status}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Direction</dt>
                        <dd className="font-medium capitalize">{t.direction}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Amount</dt>
                        <dd className="font-medium">{formatNaira(t.amount_kobo)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Reference</dt>
                        <dd className="break-all font-mono text-muted-foreground">{t.reference}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Date</dt>
                        <dd>{formatDate(t.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
          </div>

          {/* ───────── Tablet / desktop: scrollable table ───────── */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                {tab === "orders" ? (
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Failure reason</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Details</th>
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
                  ? orders.map((o) => (
                      <Fragment key={o.id}>
                        <tr>
                          <td className="whitespace-nowrap px-4 py-3 capitalize">
                            {o.service_type.replace("_", " ")} — {o.network_or_biller}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{o.recipient}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatNaira(o.display_amount_kobo ?? o.amount_kobo)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{o.provider_used ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={orderBadge(o.status)}>{o.status}</span>
                          </td>
                          <td className="min-w-[220px] max-w-xs px-4 py-3 text-xs text-destructive">
                            <span className="line-clamp-3 break-words" title={o.failure_reason ?? ""}>
                              {o.failure_reason ?? "—"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                          <td className="px-4 py-3">
                            {o.provider_attempts && (
                              <button
                                onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                                className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                              >
                                {expandedId === o.id ? "Hide" : "View raw"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedId === o.id && o.provider_attempts && (
                          <tr>
                            <td colSpan={8} className="bg-muted/30 px-4 py-3">
                              <p className="mb-2 text-xs font-medium text-secondary">
                                Provider attempts (in order tried) — the raw field is exactly what each provider returned
                              </p>
                              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs">
                                {prettyAttempts(o.provider_attempts)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  : rows.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 capitalize">{t.type.replace("_", " ")}</td>
                        <td className="px-4 py-3 capitalize">{t.direction}</td>
                        <td className="whitespace-nowrap px-4 py-3">{formatNaira(t.amount_kobo)}</td>
                        <td className="break-all px-4 py-3 font-mono text-xs text-muted-foreground">{t.reference}</td>
                        <td className="px-4 py-3">
                          <span className={walletBadge(t.status)}>{t.status}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(t.created_at)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
