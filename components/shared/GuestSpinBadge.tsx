// components/shared/GuestSpinBadge.tsx
// Floating "Spin & Win" badge shown to LOGGED-OUT visitors, globally, on every page.
// Mirrors the shopfeedme.com pattern: a small floating wheel icon that, while the
// promo window is open, invites a guest to spin.
//
// The wheel shown here is the REAL "anytime" wheel — same segments, same colors,
// same labels as /api/spin/guest-window returns (built with spinEngine's own
// toSegment(), the exact mapper the authed dashboard wheel uses) — so a guest
// sees precisely what they'll get on /dashboard a moment after logging in.
// Tapping SPIN never calls the real /api/spin (that requires a session and
// would consume a ticket); it immediately surfaces the "log in to spin" prompt.
//
// A logged-in user never sees this at all: SpinCard/SpinPopup (components/dashboard)
// already cover them, and this component unmounts itself the instant a session exists.
"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Disc3, X } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { SpinWheel, type WheelSpinResult } from "@/components/dashboard/SpinWheel"
import type { WheelSegment } from "@/components/dashboard/useSpinStatus"

export function GuestSpinBadge() {
  const router = useRouter()
  // Shared app-wide auth store (same one Header / MobileBottomNav read) instead of a
  // bespoke Supabase listener — a second, disconnected session check was the bug that
  // let this badge show up for a signed-in user (it could resolve out of step with the
  // store the rest of the app already trusts). `loading` covers the brief window before
  // the very first auth check resolves anywhere on the page.
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [windowOpen, setWindowOpen] = useState(false)
  const [segments, setSegments] = useState<WheelSegment[]>([])
  const [wheelOpen, setWheelOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // null = still checking, true/false once the shared auth store has resolved.
  const loggedIn: boolean | null = authLoading ? null : isAuthenticated

  // Poll the public window endpoint, re-checking exactly when the schedule itself
  // changes (so the badge appears/disappears on time without a page reload), and
  // pick up the real wheel segments at the same time.
  useEffect(() => {
    if (loggedIn !== false) return // only guests need this; also skip while still checking

    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch("/api/spin/guest-window")
        const json = await res.json()
        if (cancelled) return
        setWindowOpen(!!json.open)
        setSegments(Array.isArray(json.segments) ? json.segments : [])

        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        if (json.nextChangeAt) {
          const ms = new Date(String(json.nextChangeAt).replace(" ", "T") + "Z").getTime() - Date.now() + 1000
          if (ms > 0 && ms < 2_147_000_000) {
            refreshTimer.current = setTimeout(refresh, ms)
            return
          }
        }
        // No known next change time (or too far out) — fall back to a 5 minute poll.
        refreshTimer.current = setTimeout(refresh, 5 * 60_000)
      } catch {
        // Bonus feature — never surface an error, just stay hidden and retry later.
        if (!cancelled) refreshTimer.current = setTimeout(refresh, 5 * 60_000)
      }
    }

    refresh()
    return () => {
      cancelled = true
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [loggedIn])

  if (loggedIn !== false || !windowOpen) return null

  // The wheel component expects an async "spin" action. A guest has no ticket and no
  // session, so this never reaches /api/spin — it just routes straight to the
  // login prompt and tells the wheel the spin didn't happen (no fake animation).
  async function guestSpinAttempt(): Promise<WheelSpinResult> {
    setWheelOpen(false)
    setPromptOpen(true)
    return { ok: false, message: "You must be logged in to spin." }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setWheelOpen(true)}
        aria-label="Spin & Win"
        data-guest-spin-fab
        className="zpx-guest-spin-fab"
      >
        <Disc3 className="h-6 w-6 animate-spin [animation-duration:3s]" />
      </button>

      {wheelOpen && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setWheelOpen(false)}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#0F1E4D] to-[#1e3a8a] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Close"
              onClick={() => setWheelOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-amber-300">
              Spin & Win
            </p>
            <h2 className="mt-1 text-center text-xl font-bold">Log in to grab this spin!</h2>
            <p className="mt-1 text-center text-xs text-blue-100">
              This is the real wheel — log in or create a free account to play it.
            </p>
            <div className="mt-6">
              {segments.length > 0 ? (
                <SpinWheel segments={segments} onSpin={guestSpinAttempt} onDone={() => {}} buttonLabel="LOG IN TO SPIN" />
              ) : (
                <p className="py-10 text-center text-sm text-blue-100">Spin & Win isn&apos;t available right now.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {promptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[190] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setPromptOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPromptOpen(false)}
              aria-label="Close"
              className="float-right text-muted-foreground hover:text-secondary"
            >
              <X className="h-5 w-5" />
            </button>
            <Disc3 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h2 className="text-lg font-semibold text-secondary">Oh no!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You must be logged in to spin. Log in or create a free account to grab your spin.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Log in to spin
              </button>
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-muted"
              >
                Create an account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
