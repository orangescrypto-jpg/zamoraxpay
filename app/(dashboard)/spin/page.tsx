// app/(dashboard)/spin/page.tsx
// Spin & Win: the user's spins, prizes to claim (free airtime / data), discount
// coupons, and full spin history.
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Gift, History, Ticket } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { formatNaira } from "@/lib/utils"
import { SpinModal } from "@/components/dashboard/SpinModal"
import {
  parseServerTime,
  spinAuthHeaders,
  timeLeft,
  useSpinStatus,
} from "@/components/dashboard/useSpinStatus"

interface Voucher {
  id: string
  kind: "airtime" | "data" | "discount"
  label: string
  valueKobo: number
  network: string | null
  planCode: string | null
  discountPercent: number
  maxDiscountKobo: number
  discountServices: string[]
  minPurchaseKobo: number
  status: "active" | "used" | "expired"
  expiresAt: string
  usedAt: string | null
  recipient: string | null
}

interface HistoryItem {
  id: string
  sourceLabel: string | null
  prizeLabel: string
  prizeType: string
  amountKobo: number
  wasGuarantee: boolean
  createdAt: string
}

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"]

function fmtDate(s: string) {
  return parseServerTime(s).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export default function SpinPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const spin = useSpinStatus()
  const { status, loading: statusLoading } = spin

  const [open, setOpen] = useState(false)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [claimId, setClaimId] = useState<string | null>(null)
  const [recipient, setRecipient] = useState("")
  const [network, setNetwork] = useState("")
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login")
  }, [authLoading, user, router])

  const loadLists = useCallback(async () => {
    try {
      const headers = await spinAuthHeaders()
      const [v, h] = await Promise.all([
        fetch("/api/spin/vouchers", { headers }).then((r) => r.json()),
        fetch("/api/spin/history", { headers }).then((r) => r.json()),
      ])
      setVouchers(v.vouchers ?? [])
      setHistory(h.history ?? [])
    } catch {
      /* leave lists as they are */
    }
  }, [])

  useEffect(() => {
    if (user) loadLists()
  }, [user, loadLists])

  // The wheel modal updates status itself; reload prizes/history whenever it closes.
  function closeModal() {
    setOpen(false)
    spin.refresh()
    loadLists()
  }

  async function claim(v: Voucher) {
    setClaiming(true)
    setMessage(null)
    try {
      const res = await fetch("/api/spin/vouchers", {
        method: "POST",
        headers: { ...(await spinAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId: v.id, recipient, network: network || undefined }),
      })
      const json = await res.json()
      setMessage({ ok: !!json.success, text: json.message ?? (json.success ? "Sent!" : "Couldn't claim this prize.") })
      if (json.success) {
        setClaimId(null)
        setRecipient("")
        setNetwork("")
      }
      await loadLists()
      spin.refresh()
    } catch {
      setMessage({ ok: false, text: "Network problem. Your prize is safe — please try again." })
    } finally {
      setClaiming(false)
    }
  }

  const active = vouchers.filter((v) => v.status === "active")
  const past = vouchers.filter((v) => v.status !== "active")
  const tickets = status?.tickets ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">Spin &amp; Win</h1>
      <p className="mt-1 text-sm text-secondary">
        Earn spins, win prizes. Spins must be used before they expire, and prizes can only be spent on Zamorax Pay.
      </p>

      {!statusLoading && !status?.enabled && (
        <p className="mt-6 rounded-xl border border-border bg-white p-4 text-sm text-secondary">
          Spin &amp; Win isn&apos;t running right now. Check back soon!
        </p>
      )}

      {status?.enabled && (
        <section className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F1E4D] to-[#2563EB] p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-100">
            <Ticket className="h-4 w-4" /> Your spins
          </div>
          {tickets.length > 0 ? (
            <>
              <p className="mt-1 text-3xl font-bold">{tickets.length}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-blue-100">
                {tickets.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    {t.sourceLabel} · expires in {timeLeft(t.expiresAt)}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setOpen(true)}
                className="mt-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-6 py-2.5 text-sm font-extrabold shadow-lg"
              >
                Spin now
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-blue-100">
              No spins right now. Keep your daily streak going and keep buying to earn more — unused spins expire, so use them when you get them.
            </p>
          )}
        </section>
      )}

      {message && (
        <p className={`mt-4 rounded-md p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {message.text}
        </p>
      )}

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-primary">
          <Gift className="h-4 w-4" /> My prizes
        </h2>
        {active.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-white p-4 text-sm text-secondary">
            No prizes waiting. Free airtime, data and discounts you win will show up here.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {active.map((v) => (
              <li key={v.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">{v.label}</p>
                    <p className="mt-0.5 text-xs text-secondary">Use before {fmtDate(v.expiresAt)} ({timeLeft(v.expiresAt)} left)</p>
                    {v.kind === "discount" && (
                      <p className="mt-1 text-xs text-secondary">
                        Applied automatically to your next purchase
                        {v.maxDiscountKobo > 0 ? `, up to ${formatNaira(v.maxDiscountKobo)} off` : ""}
                        {v.minPurchaseKobo > 0 ? `, on purchases of ${formatNaira(v.minPurchaseKobo)} or more` : ""}.
                      </p>
                    )}
                  </div>
                  {v.kind !== "discount" && (
                    <button
                      onClick={() => {
                        setClaimId(claimId === v.id ? null : v.id)
                        setMessage(null)
                        setNetwork(v.network ?? "")
                      }}
                      className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                    >
                      {claimId === v.id ? "Cancel" : "Claim"}
                    </button>
                  )}
                </div>

                {claimId === v.id && v.kind !== "discount" && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <input
                      inputMode="numeric"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Phone number to receive it"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                    {v.kind === "airtime" && !v.network && (
                      <select
                        value={network}
                        onChange={(e) => setNetwork(e.target.value)}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <option value="">Choose network</option>
                        {NETWORKS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => claim(v)}
                      disabled={claiming || !recipient}
                      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {claiming ? "Sending…" : "Send it now"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <ul className="mt-3 space-y-2">
            {past.slice(0, 10).map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs text-secondary">
                <span>{v.label}</span>
                <span>{v.status === "used" ? `Used${v.recipient ? ` · ${v.recipient}` : ""}` : "Expired"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-primary">
          <History className="h-4 w-4" /> Spin history
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-white p-4 text-sm text-secondary">You haven&apos;t spun yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary">
                    {h.prizeType === "nothing" ? "No prize" : h.prizeLabel}
                    {h.wasGuarantee && " 🍀"}
                  </p>
                  <p className="text-xs text-secondary">
                    {h.sourceLabel ?? "Spin"} · {fmtDate(h.createdAt)}
                  </p>
                </div>
                {h.prizeType === "wallet_credit" && (
                  <span className="shrink-0 text-sm font-semibold text-accent">+{formatNaira(h.amountKobo)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SpinModal open={open} onClose={closeModal} spin={spin} />
    </div>
  )
}
