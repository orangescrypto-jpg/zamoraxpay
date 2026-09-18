// components/shared/EnableNotificationsBanner.tsx
// Persistent "enable push notifications" prompt, shown site-wide —
// mounted in the root layout next to PWAInstallBanner, so it renders
// for logged-in and logged-out visitors alike (blog readers, anyone
// browsing before signing up, etc). Subscribing does NOT require an
// account: the subscription is saved with no user_id when the visitor
// is logged out, and still receives every broadcast push (new blog
// posts, promos, cheap-data alerts) since broadcastPush() sends to all
// subscriptions regardless of user. If the visitor happens to be
// logged in, their session token is attached too, so the subscription
// is also usable for account-specific sends later.
//
// Dismiss is stored in localStorage (not sessionStorage) since this can
// now be shown to the same anonymous visitor across many separate
// sessions — a session-scoped dismiss would just re-nag them every
// visit. Re-shows automatically after 14 days, same spirit as the PWA
// install banner's reshow window.
"use client"

import { useEffect, useState } from "react"
import { Bell, X } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { subscribeToPush } from "@/hooks/usePWA"

const DISMISSED_KEY = "zpay_push_banner_dismissed_at"
const RESHOW_AFTER_SEC = 60 * 60 * 24 * 14

type PushState = "checking" | "unsupported" | "prompt" | "subscribing" | "subscribed" | "denied"

function canShow(): boolean {
  if (typeof window === "undefined") return false
  const dismissedAt = window.localStorage.getItem(DISMISSED_KEY)
  if (!dismissedAt) return true
  const elapsed = (Date.now() - parseInt(dismissedAt, 10)) / 1000
  return elapsed > RESHOW_AFTER_SEC
}

export function EnableNotificationsBanner() {
  const [state, setState] = useState<PushState>("checking")
  const [dismissed, setDismissed] = useState(true) // default hidden until checked, avoids a flash
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDismissed(!canShow())
  }, [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (typeof window === "undefined") return

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported")
        return
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied")
        return
      }

      if (Notification.permission === "granted") {
        try {
          const registration = await navigator.serviceWorker.ready
          const existing = await registration.pushManager.getSubscription()
          if (!cancelled) setState(existing ? "subscribed" : "prompt")
          return
        } catch {
          if (!cancelled) setState("prompt")
          return
        }
      }

      if (!cancelled) setState("prompt")
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEnable() {
    setState("subscribing")
    setError(null)

    try {
      // Best-effort: attach a session token if the visitor happens to
      // be logged in, but never block on it — anonymous subscribe is
      // the default and expected path here.
      let accessToken: string | undefined
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        accessToken = session?.access_token
      } catch {
        // Not logged in / Supabase client unavailable — proceed anonymously.
      }

      const ok = await subscribeToPush(accessToken)
      if (ok) {
        setState("subscribed")
      } else {
        setError("Couldn't enable notifications. You may have blocked them in your browser.")
        setState(Notification.permission === "denied" ? "denied" : "prompt")
      }
    } catch {
      setError("Something went wrong enabling notifications. Please try again.")
      setState("prompt")
    }
  }

  function handleDismiss() {
    if (typeof window !== "undefined") window.localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    setDismissed(true)
  }

  if (state === "checking" || state === "unsupported" || state === "subscribed" || state === "denied" || dismissed) {
    return null
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-primary px-4 py-2 text-primary-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <Bell className="h-5 w-5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Get notified about new posts, cheap data deals, and updates</p>
          {error && <p className="truncate text-xs text-primary-foreground/80">{error}</p>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={handleEnable}
          disabled={state === "subscribing"}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:opacity-90 disabled:opacity-50"
        >
          {state === "subscribing" ? "Enabling..." : "Enable"}
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 items-center justify-center rounded-md text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
