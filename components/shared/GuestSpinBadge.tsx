// components/shared/GuestSpinBadge.tsx
// Floating "Spin & Win" badge shown to LOGGED-OUT visitors, globally, on every page.
// Mirrors the shopfeedme.com pattern: a small floating wheel icon that, while the
// promo window is open, invites a guest to spin — tapping it (since they have no
// session) shows a "you must be logged in to spin" prompt instead of the wheel.
//
// A logged-in user never sees this: SpinCard/SpinPopup (components/dashboard) already
// cover them. This component only renders for guests, and only while the SAME admin-
// controlled "anytime" source window (checked via the public, unauthenticated
// /api/spin/guest-window route) is open — it never leaks odds or writes anything.
"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, X } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"

export function GuestSpinBadge() {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null) // null = still checking
  const [windowOpen, setWindowOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Is there a session at all? We don't need the dashboard's full spin status here —
  // just enough to know this visitor is a guest, not a signed-in user.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setLoggedIn(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setLoggedIn(!!session)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  // Poll the public window endpoint, re-checking exactly when the schedule itself
  // changes (so the badge appears/disappears on time without a page reload).
  useEffect(() => {
    if (loggedIn !== false) return // only guests need this; also skip while still checking

    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch("/api/spin/guest-window")
        const json = await res.json()
        if (cancelled) return
        setWindowOpen(!!json.open)

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

  return (
    <>
      <button
        type="button"
        onClick={() => setPromptOpen(true)}
        aria-label="Spin & Win — log in to play"
        className="fixed bottom-24 right-4 z-[170] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-popover transition hover:scale-105 active:scale-95 md:bottom-6"
      >
        <Sparkles className="h-6 w-6 animate-pulse" />
      </button>

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
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" />
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
