// components/dashboard/SpinCard.tsx
// Inline spin card. On the dashboard it sits directly BELOW the announcement banner and
// ABOVE Quick actions, so a user who closes (or never sees) the popup still has it.
// It disappears once the user has no spin left; it stays as a small "prize waiting"
// strip while they hold an unclaimed voucher or an unused discount coupon.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Gift, Sparkles } from "lucide-react"
import { SpinModal } from "@/components/dashboard/SpinModal"
import { spinAuthHeaders, timeLeft, type SpinApi } from "@/components/dashboard/useSpinStatus"

interface Winner {
  text: string
}

export function SpinCard({ spin }: { spin: SpinApi }) {
  const { status } = spin
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [winners, setWinners] = useState<Winner[]>([])
  const [winnerIdx, setWinnerIdx] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const hasTickets = !!status?.enabled && status.tickets.length > 0
  const showWinners = hasTickets && !!status?.winnersEnabled

  useEffect(() => {
    if (!showWinners) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/spin/winners", { headers: await spinAuthHeaders() })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setWinners(json.winners ?? [])
      } catch {
        /* winner feed is decoration — ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showWinners])

  useEffect(() => {
    if (winners.length < 2) return
    const t = setInterval(() => setWinnerIdx((i) => (i + 1) % winners.length), 4000)
    return () => clearInterval(t)
  }, [winners.length])

  useEffect(() => {
    if (!hasTickets) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [hasTickets])

  // Once the ticket we're showing actually expires, pull a fresh status
  // instead of leaving a dead "expired" ticket on screen.
  useEffect(() => {
    if (!status?.nextExpiresAt) return
    const ms = new Date(status.nextExpiresAt.replace(" ", "T") + "Z").getTime() - now
    if (ms <= 0) spin.refresh()
  }, [now, status?.nextExpiresAt, spin])

  if (!status?.enabled) return null

  const prizeWaiting = status.activeVouchers + status.activeCoupons

  if (!hasTickets) {
    if (prizeWaiting <= 0) return null
    return (
      <Link
        href="/spin"
        className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <Gift className="h-5 w-5 shrink-0" />
        <span className="flex-1">
          You have {prizeWaiting} spin prize{prizeWaiting === 1 ? "" : "s"} waiting to use.
        </span>
        <span className="text-xs font-semibold underline">View</span>
      </Link>
    )
  }

  // One card PER SOURCE. Each shows its own count, its own wording and its own
  // deadline (its ticket expiry or its source's end time). Nothing is shared
  // between sources, so one source's schedule never drives another's card.
  const groups = new Map<string, { label: string; count: number; expiresAt: string }>()
  for (const t of status.tickets) {
    const g = groups.get(t.sourceKey)
    if (!g) groups.set(t.sourceKey, { label: t.sourceLabel, count: 1, expiresAt: t.expiresAt })
    else {
      g.count++
      if (t.expiresAt < g.expiresAt) g.expiresAt = t.expiresAt
    }
  }

  const words = (key: string) =>
    key === "scratch_card"
      ? { emoji: "🎫", action: "scratch card", cta: "Scratch now" }
      : key === "mystery_box"
        ? { emoji: "🎁", action: "mystery box", cta: "Open now" }
        : key === "pick_a_card"
          ? { emoji: "🃏", action: "card pick", cta: "Pick now" }
          : { emoji: "🎡", action: "free spin", cta: "Spin now" }

  return (
    <>
      {Array.from(groups.entries()).map(([key, g], idx) => {
        const w = words(key)
        return (
          <div key={key} className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F1E4D] to-[#2563EB] p-4 text-white shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl" aria-hidden="true">
                {w.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{g.count > 1 ? `You have ${g.count} ${w.action}s!` : `You have a ${w.action}!`}</p>
                <p className="text-xs text-blue-100">Use it before it expires · {timeLeft(g.expiresAt, now)} left</p>
              </div>
              <button
                onClick={() => setOpenKey(key)}
                className="shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-5 py-2 text-sm font-extrabold text-white shadow-lg"
              >
                {w.cta}
              </button>
            </div>
            {idx === 0 && showWinners && winners.length > 0 && (
              <p className="mt-3 flex items-center gap-2 border-t border-white/15 pt-2 text-xs text-blue-100">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="truncate">{winners[winnerIdx % winners.length].text}</span>
              </p>
            )}
          </div>
        )
      })}
      <SpinModal open={openKey !== null} onClose={() => setOpenKey(null)} spin={spin} sourceKey={openKey ?? undefined} />
    </>
  )
}
