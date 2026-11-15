// hooks/useOrderStatusPolling.ts
// NEW: live purchase-status polling (audit finding: "the client never
// polls; after a purchase the user gets one static banner and a stuck
// order shows an amber 'pending' chip forever").
//
// Usage: after a purchase whose result has isPending (or a result whose
// final state is unknown), pass the orderId + auth header getter to
// this hook. It polls /api/vtu/order-status with a gentle backoff
// (4s -> 8s -> 15s -> 30s ceiling) and stops as soon as the order
// leaves "pending". It also:
//   - stops on unmount and on page hide (no wasted CPU/data when the
//     tab is backgrounded — part of the CPU/perf cleanup)
//   - gives up after ~10 minutes and tells the caller it timed out
//     (the reconciliation cron will still resolve the order server-side)
//   - never throws: errors just retry on the next tick
//
// This mirrors the wallet-funding verify pattern (5 polls after gateway
// redirect) that already exists, extended to purchases.

"use client"

import { useEffect, useRef, useState } from "react"

export interface OrderStatus {
  id: string
  status: "pending" | "success" | "failed" | "refunded" | string
  failureReason: string | null
  deliveredData: unknown
  amountKobo: number
  serviceType: string
  networkOrBiller: string
  recipient: string
  providerReference: string | null
}

export interface OrderStatusPollingResult {
  /** Latest known status; null until the first poll returns. */
  order: OrderStatus | null
  /** True while polling is active (order still pending, budget left). */
  polling: boolean
  /** True when the polling budget ran out with the order still pending. */
  timedOut: boolean
  /** Latest poll error, surfaced so the UI can hint at connectivity. */
  error: string | null
}

const INTERVALS_MS = [4000, 8000, 15000, 30000, 30000]
const MAX_DURATION_MS = 10 * 60 * 1000

export function useOrderStatusPolling(
  orderId: string | null,
  getAuthHeader: () => Promise<Record<string, string>>,
  onResolved?: (order: OrderStatus) => void,
): OrderStatusPollingResult {
  // All polling state lives in one object keyed by the orderId it
  // belongs to. When orderId changes, the derived value naturally
  // starts from a clean slate — no setState-during-render reset, no
  // cascading effect.
  interface PollState {
    orderId: string | null
    order: OrderStatus | null
    polling: boolean
    timedOut: boolean
    error: string | null
  }
  const [state, setState] = useState<PollState>({
    orderId: null,
    order: null,
    polling: false,
    timedOut: false,
    error: null,
  })
  const fresh =
    state.orderId !== orderId
      ? { orderId, order: null, polling: !!orderId, timedOut: false, error: null } as PollState
      : state
  const { order, polling, timedOut, error } = fresh

  // Keep the latest callbacks in refs so the polling effect isn't
  // torn down and recreated whenever the caller re-renders.
  const getAuthHeaderRef = useRef(getAuthHeader)
  const onResolvedRef = useRef(onResolved)
  useEffect(() => {
    getAuthHeaderRef.current = getAuthHeader
  }, [getAuthHeader])
  useEffect(() => {
    onResolvedRef.current = onResolved
  }, [onResolved])


  useEffect(() => {
    if (!orderId) return

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let tickIndex = 0
    const startedAt = Date.now()

    const patch = (partial: Partial<PollState>) => {
      if (stopped) return
      setState((current) => (current.orderId === orderId ? { ...current, ...partial } : current))
    }

    const scheduleNext = () => {
      if (stopped) return
      const elapsed = Date.now() - startedAt
      if (elapsed >= MAX_DURATION_MS) {
        patch({ timedOut: true, polling: false })
        return
      }
      const delay = INTERVALS_MS[Math.min(tickIndex, INTERVALS_MS.length - 1)]
      timer = setTimeout(poll, delay)
    }

    const poll = async () => {
      try {
        const headers = await getAuthHeaderRef.current()
        const res = await fetch(`/api/vtu/order-status?id=${encodeURIComponent(orderId)}`, {
          headers: { Accept: "application/json", ...headers },
        })
        if (!res.ok) throw new Error(`Status check failed (${res.status})`)
        const data = (await res.json()) as OrderStatus
        if (stopped) return

        patch({ error: null, order: data })

        if (data.status !== "pending") {
          patch({ polling: false })
          onResolvedRef.current?.(data)
          return // terminal state — stop polling
        }
      } catch (err) {
        if (!stopped) {
          patch({ error: err instanceof Error ? err.message : "Status check failed" })
          // fall through: retry on the next tick
        }
      }
      tickIndex += 1
      scheduleNext()
    }

    // Pause the schedule while the tab is hidden — no wasted requests
    // or CPU when the user switched away; resumes on visibility.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !stopped && timer) {
        clearTimeout(timer)
        timer = null
        poll()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    poll()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [orderId])

  return { order, polling, timedOut, error }
}
