// components/dashboard/useSpinStatus.ts
// One shared fetch of the user's Spin & Win status. The dashboard creates a single
// instance and hands it to BOTH the popup and the inline card, so they never fetch
// twice and always agree (a spin in the popup instantly updates the card).
"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

export interface WheelSegment {
  id: string
  label: string
  type: "nothing" | "wallet_credit" | "discount" | "airtime_voucher" | "data_voucher" | "streak_protection"
  amountKobo: number
  color: string | null
  isJackpot: boolean
}

export interface SpinTicket {
  id: string
  sourceKey: string
  sourceLabel: string
  expiresAt: string
  startsAt?: string | null
  endsAt?: string | null
}

export interface SpinStatusData {
  enabled: boolean
  popupEnabled: boolean
  winnersEnabled: boolean
  tickets: SpinTicket[]
  wheels: Record<string, WheelSegment[]>
  nextExpiresAt: string | null
  nextRefreshAt?: string | null
  activeVouchers: number
  activeCoupons: number
  spinsLeftToday: number | null
}

export interface SpinOutcome {
  spinId: string
  prizeId: string | null
  prizeLabel: string
  prizeType: WheelSegment["type"]
  amountKobo: number
  wasGuarantee: boolean
  ticketsLeft: number
  message: string
}

export async function spinAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}` }
}

export type SpinApi = ReturnType<typeof useSpinStatus>

export function useSpinStatus(refreshKey?: unknown) {
  const [status, setStatus] = useState<SpinStatusData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/spin", { headers: await spinAuthHeaders() })
      if (!res.ok) throw new Error("status failed")
      setStatus(await res.json())
    } catch {
      // Spin is a bonus feature: on any failure just behave as "nothing to show" — never break the page.
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  // Refresh exactly when the schedule changes by itself (a source's start time,
  // a ticket's end time, UTC midnight) so tickets appear / disappear on time
  // without the user reloading the page.
  const nextRefreshAt = status?.nextRefreshAt ?? null
  useEffect(() => {
    if (!nextRefreshAt) return
    const ms = new Date(nextRefreshAt.replace(" ", "T") + "Z").getTime() - Date.now() + 1000
    if (ms > 2_147_000_000) return
    const t = setTimeout(() => refresh(), Math.max(1000, ms))
    return () => clearTimeout(t)
  }, [nextRefreshAt, refresh])

  return { status, loading, refresh }
}

/** 'YYYY-MM-DD HH:MM:SS' (UTC, as the server stores it) → Date. */
export function parseServerTime(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z")
}

/** "4h 12m", "35m", "less than a minute". */
export function timeLeft(expiresAt: string, now: number = Date.now()): string {
  const ms = parseServerTime(expiresAt).getTime() - now
  if (ms <= 0) return "expired"
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return "less than a minute"
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
