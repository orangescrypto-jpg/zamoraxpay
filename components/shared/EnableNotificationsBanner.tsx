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
// visit. Dismiss is permanent: it does not reshow after any window.
// The only way the banner comes back is if the visitor clears their
// browser storage or actually enables notifications and later revokes
// them.
//
// If the browser/OS permission is "denied", there's no programmatic
// way back — the browser will never re-prompt, and re-calling
// Notification.requestPermission() just resolves to "denied" again
// instantly with no UI. So instead of hiding entirely, this shows a
// quieter, separately-dismissible hint pointing the visitor to their
// browser's own site-settings toggle, since that's the only real path
// back to re-enabling.
"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, X } from "lucide-react"
import { createClient } from "@/src/services/providers/supabase/client"
import { subscribeToPush } from "@/hooks/usePWA"

const DISMISSED_KEY = "zpay_push_banner_dismissed_at"
const DENIED_DISMISSED_KEY = "zpay_push_denied_hint_dismissed_at"

type PushState = "checking" | "unsupported" | "prompt" | "subscribing" | "subscribed" | "denied"
type BrowserKind = "chrome" | "firefox" | "safari" | "edge" | "other"

function canShow(key: string): boolean {
  if (typeof window === "undefined") return false
  // Once dismissed, stays dismissed permanently — no reshow window.
  // Only actually enabling notifications (state becomes "subscribed")
  // makes the banner go away for good in a meaningful sense; dismiss
  // just means "don't ask me again."
  return !window.localStorage.getItem(key)
}

function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "other"
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return "edge"
  if (/Firefox\//.test(ua)) return "firefox"
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return "chrome"
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari"
  return "other"
}

const UNBLOCK_STEPS: Record<BrowserKind, string> = {
  chrome: "Tap the lock/info icon next to the address bar → Permissions → Notifications → Allow.",
  edge: "Tap the lock/info icon next to the address bar → Permissions for this site → Notifications → Allow.",
  firefox: "Tap the lock icon next to the address bar → Permissions → Notifications → Allow.",
  safari: "Open Settings → Safari → Notifications (or Websites → Notifications) and allow this site.",
  other: "Open your browser's site settings for this page and allow Notifications.",
}

export function EnableNotificationsBanner() {
  const [state, setState] = useState<PushState>("checking")
  const [dismissed, setDismissed] = useState(true) // default hidden until checked, avoids a flash
  const [error, setError] = useState<string | null>(null)
  const [browser, setBrowser] = useState<BrowserKind>("other")

  useEffect(() => {
    setBrowser(detectBrowser())
  }, [])

  useEffect(() => {
    // Two independent dismiss windows: the normal "enable notifications"
    // prompt (DISMISSED_KEY) and the separate "notifications are
    // blocked, here's how to unblock" hint (DENIED_DISMISSED_KEY) — a
    // user dismissing one shouldn't affect the other, since they're
    // shown at different points and mean different things.
    setDismissed(!canShow(DISMISSED_KEY))
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

  function handleDismissDeniedHint() {
    if (typeof window !== "undefined") window.localStorage.setItem(DENIED_DISMISSED_KEY, Date.now().toString())
    setDismissed(true)
  }

  if (state === "checking" || state === "unsupported" || state === "subscribed") {
    return null
  }

  if (state === "denied") {
    if (!canShow(DENIED_DISMISSED_KEY)) return null

    return (
      <div className="sticky top-0 z-50 flex items-start justify-between gap-3 bg-secondary px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-start gap-2">
          <BellOff className="mt-0.5 h-4.5 w-4.5 flex-shrink-0 opacity-80" />
          <p className="text-xs leading-snug opacity-90">
            <span className="font-medium">Notifications are blocked for this site.</span> {UNBLOCK_STEPS[browser]}
          </p>
        </div>
        <button
          onClick={handleDismissDeniedHint}
          aria-label="Dismiss"
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md opacity-70 hover:bg-white/10 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (dismissed) return null

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
