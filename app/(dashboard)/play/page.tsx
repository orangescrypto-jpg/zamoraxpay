// app/(dashboard)/play/page.tsx
// "Play & Earn" hub — one place linking to every game the user can currently play
// (Spin & Win, Scratch card, Mystery box, and any future source added the same way).
// Entirely driven by the same /api/spin status the dashboard card uses, grouped by
// source_key, so a new game just needs a source_key + prize table to show up here
// automatically — nothing on this page needs to change.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Dices, Gift, Ticket, Sparkles, type LucideIcon } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { SpinModal } from "@/components/dashboard/SpinModal"
import { timeLeft, useSpinStatus } from "@/components/dashboard/useSpinStatus"

interface GameMeta {
  title: string
  blurb: string
  icon: LucideIcon
  colorClass: string
  emoji: string
}

const GAME_META: Record<string, GameMeta> = {
  scratch_card: {
    title: "Scratch card",
    blurb: "Scratch to reveal a prize. A new card every day.",
    icon: Ticket,
    colorClass: "from-blue-600 to-blue-800",
    emoji: "🎫",
  },
  mystery_box: {
    title: "Mystery box",
    blurb: "Open the box after a qualifying purchase.",
    icon: Gift,
    colorClass: "from-purple-600 to-fuchsia-800",
    emoji: "🎁",
  },
  pick_a_card: {
    title: "Pick a card",
    blurb: "Pick one of 4 face-down cards. A new deck every day.",
    icon: Sparkles,
    colorClass: "from-emerald-600 to-teal-800",
    emoji: "🃏",
  },
}

const DEFAULT_META: GameMeta = {
  title: "Spin & Win",
  blurb: "Spin the wheel for a chance to win.",
  icon: Dices,
  colorClass: "from-[#0F1E4D] to-[#2563EB]",
  emoji: "🎡",
}

function metaFor(sourceKey: string): GameMeta {
  return GAME_META[sourceKey] ?? DEFAULT_META
}

export default function PlayPage() {
  const router = useRouter()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const spin = useSpinStatus()
  const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null)
  const [vouchers, setVouchers] = useState<{ activeVouchers: number; activeCoupons: number } | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login?redirect=/play")
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (spin.status) {
      setVouchers({ activeVouchers: spin.status.activeVouchers, activeCoupons: spin.status.activeCoupons })
    }
  }, [spin.status])

  if (authLoading || !isAuthenticated) return null

  const status = spin.status
  const grouped = new Map<string, { sourceLabel: string; count: number; nextExpiresAt: string | null }>()
  for (const t of status?.tickets ?? []) {
    const g = grouped.get(t.sourceKey)
    if (g) {
      g.count++
      if (!g.nextExpiresAt || t.expiresAt < g.nextExpiresAt) g.nextExpiresAt = t.expiresAt
    } else {
      grouped.set(t.sourceKey, { sourceLabel: t.sourceLabel, count: 1, nextExpiresAt: t.expiresAt })
    }
  }
  const games = Array.from(grouped.entries())
  const prizeWaiting = (vouchers?.activeVouchers ?? 0) + (vouchers?.activeCoupons ?? 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">Play &amp; Earn</h1>
      <p className="mt-1 text-sm text-secondary">
        Every game you currently have access to, in one place. Come back daily — new tickets and cards refresh
        regularly.
      </p>

      {!status?.enabled && (
        <p className="mt-6 rounded-xl border border-border bg-white p-5 text-sm text-secondary">
          No games are available right now. Check back soon!
        </p>
      )}

      {status?.enabled && games.length === 0 && (
        <div className="mt-6 rounded-xl border border-border bg-white p-5 text-sm text-secondary">
          You don&apos;t have any tickets right now. Keep using the app — free tickets, purchase rewards, and
          streak bonuses show up here automatically.
        </div>
      )}

      <div className="mt-6 space-y-4">
        {games.map(([sourceKey, g]) => {
          const meta = metaFor(sourceKey)
          const Icon = meta.icon
          return (
            <div key={sourceKey} className={`overflow-hidden rounded-2xl bg-gradient-to-br ${meta.colorClass} p-5 text-white shadow-lg`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{meta.title}</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold tracking-tight">
                    {g.count} {g.count === 1 ? "ticket" : "tickets"} ready
                  </p>
                  <p className="mt-1 text-xs text-white/70">{meta.blurb}</p>
                  {g.nextExpiresAt && (
                    <p className="mt-1 text-xs text-white/70">Next expires in {timeLeft(g.nextExpiresAt)}</p>
                  )}
                </div>
                <button
                  onClick={() => setActiveSourceKey(sourceKey)}
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-white/90"
                >
                  {meta.emoji} Play
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {prizeWaiting > 0 && (
        <Link
          href="/spin"
          className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            You have {prizeWaiting} prize{prizeWaiting === 1 ? "" : "s"} waiting to claim
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      )}

      <Link
        href="/spin"
        className="mt-4 flex items-center justify-between rounded-xl border border-border bg-white p-4 text-sm font-semibold text-primary hover:bg-muted"
      >
        <span>History &amp; all your past prizes</span>
        <span className="text-xs text-secondary">View →</span>
      </Link>

      <SpinModal
        open={activeSourceKey !== null}
        onClose={() => setActiveSourceKey(null)}
        spin={spin}
        sourceKey={activeSourceKey ?? undefined}
      />
    </div>
  )
}
