// app/(dashboard)/history/page.tsx
"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Clock3, Copy, Download, ReceiptText, Search, XCircle } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"
import { ReceiptButton } from "@/components/dashboard/ReceiptButton"

interface DeliveredPin { pin: string; serialNumber?: string }
interface OrderDeliveredData { pins?: DeliveredPin[]; token?: string; units?: string; deliveryNote?: string }
interface OrderRow {
  id: string; service_type: string; network_or_biller: string; recipient: string; amount_kobo: number
  display_amount_kobo?: number; is_free_prize?: boolean; status: string; created_at: string; delivered_data?: string | null
}
interface WalletTransactionRow { id: string; type: string; direction: "credit" | "debit"; amount_kobo: number; status: string; created_at: string }
type FeedItem = { kind: "order"; created_at: string; data: OrderRow } | { kind: "wallet"; created_at: string; data: WalletTransactionRow }

const WALLET_TYPE_LABELS: Record<string, string> = {
  funding: "Wallet Funding", purchase: "Purchase", refund: "Refund", cashback: "Cashback", referral_bonus: "Referral Bonus",
  reseller_upgrade: "Reseller Upgrade", admin_adjustment: "Adjustment", deposit_bonus: "Deposit Bonus", spin_reward: "Spin & Win Prize", korapay_charge: "Deposit Charges",
}

const REPEAT_PATHS: Record<string, string> = {
  airtime: "/dashboard/services/airtime", data: "/dashboard/services/data", cable: "/dashboard/services/cable", electricity: "/dashboard/services/electricity",
  exam_pin: "/dashboard/services/exam-pin", epin: "/dashboard/services/epin", betting: "/dashboard/services/betting", bulk_data: "/dashboard/services/bulk-data", bulk_airtime: "/dashboard/services/bulk-airtime",
}

function statusMeta(status: string) {
  if (status === "success" || status === "completed") return { className: "text-emerald-700 bg-emerald-50", Icon: CheckCircle2 }
  if (status === "failed" || status === "reversed") return { className: "text-red-700 bg-red-50", Icon: XCircle }
  return { className: "text-amber-700 bg-amber-50", Icon: Clock3 }
}

function parseDelivered(value?: string | null) {
  if (!value) return null
  try { return JSON.parse(value) as OrderDeliveredData } catch { return null }
}

function repeatPath(serviceType: string) {
  const normalized = serviceType.toLowerCase().replace(/\s+/g, "_")
  return REPEAT_PATHS[normalized] ?? null
}

export default function HistoryPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "success" | "failed" | "pending">("all")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setItems([]); return }
        const res = await fetch("/api/history", { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (!res.ok) throw new Error("We couldn't load your transaction history.")
        const data = await res.json()
        if (cancelled) return
        const orders: OrderRow[] = data.orders ?? []
        const walletTransactions: WalletTransactionRow[] = data.walletTransactions ?? []
        setItems([
          ...orders.map((o): FeedItem => ({ kind: "order", created_at: o.created_at, data: o })),
          ...walletTransactions.filter((w) => w.type !== "purchase").map((w): FeedItem => ({ kind: "wallet", created_at: w.created_at, data: w })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "We couldn't load your history.")
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => items.filter((item) => {
    const status = item.data.status
    const text = item.kind === "order"
      ? `${item.data.service_type} ${item.data.network_or_biller} ${item.data.recipient} ${item.data.id}`
      : `${WALLET_TYPE_LABELS[item.data.type] ?? item.data.type} ${item.data.id}`
    const matchesQuery = !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase())
    const matchesFilter = filter === "all" || (filter === "pending" ? !["success", "completed", "failed", "reversed"].includes(status) : status === filter || (filter === "success" && status === "completed"))
    return matchesQuery && matchesFilter
  }), [items, query, filter])

  const copy = async (value: string) => {
    try { await navigator.clipboard?.writeText(value); setCopied(value); setTimeout(() => setCopied(null), 1400) } catch {}
  }

  const exportFiltered = () => {
    const lines = ["type,service_or_label,recipient,amount,status,date,reference"]
    filtered.forEach((item) => {
      if (item.kind === "order") {
        const o = item.data
        lines.push(["order", `${o.service_type} · ${o.network_or_biller}`, o.recipient, ((o.display_amount_kobo ?? o.amount_kobo) / 100).toFixed(2), o.status, o.created_at, o.id].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      } else {
        const t = item.data
        lines.push(["wallet", WALLET_TYPE_LABELS[t.type] ?? t.type, "", (t.amount_kobo / 100).toFixed(2), t.status, t.created_at, t.id].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      }
    })
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "zamoraxpay-transactions.csv"; a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return <PageSkeleton rows={7} />

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Activity</p><h1 className="mt-1 text-2xl font-heading font-bold text-secondary">Transaction History</h1></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{items.length} total</span>
      </div>

      <div className="sticky top-[4.5rem] z-10 mb-4 rounded-2xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transactions or recipient" className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><XCircle className="h-4 w-4" /></button>}</div>
        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          {(["all", "success", "pending", "failed"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${filter === value ? "bg-primary text-white" : "bg-muted text-secondary hover:bg-primary/10 hover:text-primary"}`}>{value}</button>)}
          <button type="button" onClick={exportFiltered} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-secondary hover:border-primary/30 hover:text-primary" title="Export visible transactions"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button onClick={() => window.location.reload()} className="mt-2 font-semibold underline">Try again</button></div>}

      {items.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center"><ReceiptText className="mx-auto h-9 w-9 text-muted-foreground/40" /><h2 className="mt-3 font-semibold text-secondary">No transactions yet</h2><p className="mt-1 text-sm text-muted-foreground">Your airtime, data, bills and wallet activity will appear here.</p><Link href="/dashboard" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Go to dashboard</Link></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-medium text-secondary">No matching transactions</p><p className="mt-1 text-xs text-muted-foreground">Try a different search or status filter.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            if (item.kind === "order") {
              const order = item.data
              const delivered = parseDelivered(order.delivered_data)
              const isExpanded = expandedId === order.id
              const meta = statusMeta(order.status)
              const repeat = repeatPath(order.service_type)
              const amount = order.display_amount_kobo ?? order.amount_kobo
              return <div key={`order-${order.id}`} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <button type="button" onClick={() => setExpandedId(isExpanded ? null : order.id)} className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted/30">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.className}`}><meta.Icon className="h-4.5 w-4.5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold capitalize text-secondary">{order.service_type.replaceAll("_", " ")} · {order.network_or_biller}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{order.recipient}</span><span className="mt-1 block text-[11px] text-muted-foreground">{formatDate(order.created_at)} · {order.id}</span></span>
                  <span className="shrink-0 text-right"><span className="block text-sm font-semibold text-secondary">{formatNaira(amount)}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${meta.className}`}>{order.status}</span></span>
                  {isExpanded ? <ChevronUp className="mt-3 h-4 w-4 text-muted-foreground" /> : <ChevronDown className="mt-3 h-4 w-4 text-muted-foreground" />}
                </button>
                {isExpanded && <div className="border-t border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-2 gap-3 text-xs"><Detail label="Service" value={`${order.service_type.replaceAll("_", " ")} · ${order.network_or_biller}`} /><Detail label="Recipient" value={order.recipient} /><Detail label="Amount" value={formatNaira(amount)} /><Detail label="Reference" value={order.id} copy={copy} /></div>
                  {order.is_free_prize && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">This transaction was delivered as a free prize.</p>}
                  {delivered?.pins?.map((p, i) => <DeliveredValue key={i} label="PIN" value={p.pin} serial={p.serialNumber} copy={copy} copied={copied} />)}
                  {delivered?.token && <DeliveredValue label="Token" value={delivered.token} serial={delivered.units ? `Units: ${delivered.units}` : undefined} copy={copy} copied={copied} />}
                  {delivered?.deliveryNote && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{delivered.deliveryNote}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2"><ReceiptButton service={`${order.service_type} · ${order.network_or_biller}`} reference={order.id} amount={formatNaira(amount)} status={order.status} date={formatDate(order.created_at)} recipient={order.recipient} />{repeat && <Link href={repeat} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90"><ArrowUpRight className="h-3.5 w-3.5" /> Buy again</Link>}</div>
                </div>}
              </div>
            }
            const tx = item.data
            const meta = statusMeta(tx.status)
            const label = WALLET_TYPE_LABELS[tx.type] ?? tx.type.replaceAll("_", " ")
            return <div key={`wallet-${tx.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.className}`}>{tx.direction === "credit" ? <ArrowDownToLine className="h-4.5 w-4.5" /> : <ArrowUpRight className="h-4.5 w-4.5" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold capitalize text-secondary">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(tx.created_at)} · {tx.id}</p></div><div className="text-right"><p className={`text-sm font-semibold ${tx.direction === "credit" ? "text-emerald-700" : "text-secondary"}`}>{tx.direction === "credit" ? "+" : "-"}{formatNaira(tx.amount_kobo)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${meta.className}`}>{tx.status}</span></div></div>
          })}
        </div>
      )}
      {copied && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-white shadow-lg">Copied to clipboard</div>}
    </div>
  )
}

function Detail({ label, value, copy }: { label: string; value: string; copy?: (value: string) => void }) {
  return <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 break-words text-xs font-medium text-secondary">{value}</p>{copy && <button onClick={() => copy(value)} aria-label={`Copy ${label}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"><Copy className="h-3.5 w-3.5" /></button>}</div></div>
}

function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="container max-w-2xl py-8"><div className="mb-5 h-8 w-48 animate-pulse rounded-lg bg-muted" /><div className="mb-4 h-20 animate-pulse rounded-2xl bg-muted" /><div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-muted/60" />)}</div></div>
}

function DeliveredValue({ label, value, serial, copy, copied }: { label: string; value: string; serial?: string; copy: (value: string) => void | Promise<void>; copied: string | null }) {
  return <div className="mt-3 rounded-xl border border-primary/15 bg-card p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-secondary">{value}</p>{serial && <p className="mt-1 text-[11px] text-muted-foreground">{serial}</p>}</div><button type="button" onClick={() => copy(value)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-secondary hover:bg-muted"><Copy className="h-3.5 w-3.5" />{copied === value ? "Copied" : "Copy"}</button></div></div>
}
