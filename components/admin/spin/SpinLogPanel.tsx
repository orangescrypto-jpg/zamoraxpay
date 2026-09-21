// components/admin/spin/SpinLogPanel.tsx
// What has been paid out, and every recent spin.
"use client"

import { useCallback, useEffect, useState } from "react"
import { adminApi, btnGhost, fmt, inputCls, type AdminOverview } from "@/components/admin/spin/shared"

interface Totals {
  spins: number
  wins: number
  costKobo: number
}
interface LogData {
  page: number
  spins: { id: string; sourceKey: string; prizeLabel: string; prizeType: string; amountKobo: number; costKobo: number; wasGuarantee: boolean; createdAt: string; userName: string | null; userEmail: string | null }[]
  totals: { today: Totals; last7Days: Totals; allTime: Totals }
  bySource7d: { sourceKey: string; spins: number; costKobo: number }[]
  vouchers: { kind: string; status: string; count: number }[]
  tickets: { status: string; count: number }[]
}

function TotalsCard({ title, t }: { title: string; t: Totals }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs text-secondary">{title}</p>
      <p className="mt-1 text-xl font-bold text-primary">{fmt(t.costKobo)}</p>
      <p className="text-xs text-secondary">
        {t.spins} spins · {t.wins} wins
      </p>
    </div>
  )
}

export function SpinLogPanel({ data }: { data: AdminOverview }) {
  const [log, setLog] = useState<LogData | null>(null)
  const [page, setPage] = useState(1)
  const [source, setSource] = useState("")
  const [error, setError] = useState("")
  const label = (k: string) => data.sources.find((s) => s.sourceKey === k)?.label ?? k

  const load = useCallback(async () => {
    try {
      setLog(await adminApi<LogData>(`/api/admin/spin/log?page=${page}${source ? `&source=${source}` : ""}`))
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }, [page, source])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
  if (!log) return <p className="text-sm text-secondary">Loading…</p>

  const count = (arr: { status: string; count: number }[], s: string) => arr.find((x) => x.status === s)?.count ?? 0

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <TotalsCard title="Prizes paid today (cost)" t={log.totals.today} />
        <TotalsCard title="Last 7 days" t={log.totals.last7Days} />
        <TotalsCard title="All time" t={log.totals.allTime} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4 text-sm">
          <p className="text-xs text-secondary">Tickets</p>
          <p className="mt-1 text-primary">
            {count(log.tickets, "available")} available · {count(log.tickets, "used")} spun · {count(log.tickets, "expired")} expired
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 text-sm">
          <p className="text-xs text-secondary">Vouchers &amp; coupons</p>
          <p className="mt-1 text-primary">
            {log.vouchers.length === 0
              ? "None yet"
              : log.vouchers.map((v) => `${v.count} ${v.kind} ${v.status}`).join(" · ")}
          </p>
        </div>
      </div>

      {log.bySource7d.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs font-semibold text-primary">Last 7 days by source</p>
          <ul className="mt-2 space-y-1 text-sm">
            {log.bySource7d.map((s) => (
              <li key={s.sourceKey} className="flex justify-between">
                <span>{label(s.sourceKey)}</span>
                <span className="text-secondary">
                  {s.spins} spins · {fmt(s.costKobo)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} className={`${inputCls} max-w-xs`}>
          <option value="">All sources</option>
          {data.sources.map((s) => (
            <option key={s.sourceKey} value={s.sourceKey}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-secondary">
            <tr>
              <th className="px-3 py-2">When (UTC)</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {log.spins.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-secondary">
                  No spins yet.
                </td>
              </tr>
            )}
            {log.spins.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-secondary">{s.createdAt}</td>
                <td className="px-3 py-2">
                  <p className="text-sm text-primary">{s.userName ?? "—"}</p>
                  <p className="text-[11px] text-secondary">{s.userEmail}</p>
                </td>
                <td className="px-3 py-2 text-xs">{label(s.sourceKey)}</td>
                <td className="px-3 py-2">
                  {s.prizeType === "nothing" ? <span className="text-secondary">No prize</span> : s.prizeLabel}
                  {s.wasGuarantee && " 🍀"}
                </td>
                <td className="px-3 py-2">{s.costKobo > 0 ? fmt(s.costKobo) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Newer
        </button>
        <span className="text-xs text-secondary">Page {page}</span>
        <button className={btnGhost} disabled={log.spins.length < 25} onClick={() => setPage(page + 1)}>
          Older →
        </button>
      </div>
    </div>
  )
}
