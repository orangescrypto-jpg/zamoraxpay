// components/dashboard/DashboardPopupAnnouncement.tsx
// Modal popup announcement, sourced from the same
// /api/dashboard-announcement response as the banner strip (the
// `popups` array — items with display_style = 'popup'). Shows the
// first eligible popup only (one at a time, not a carousel).
//
// Dismissal: there is no per-user dismissal table in this codebase,
// so "don't show again" is tracked client-side via localStorage,
// keyed per announcement id:
//   - show_once = 1  → dismissing writes localStorage and the popup
//                       never shows again on this browser until the
//                       admin edits/re-creates the announcement (new id).
//   - show_once = 0  → dismissing only hides it for this page session
//                       (sessionStorage) — it reappears on next login.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"

interface PopupAnnouncement {
  id: string
  text: string | null
  imageUrl: string | null
  linkUrl: string | null
  backgroundColor: string | null
  showOnce: boolean
}

const DISMISSED_KEY_PREFIX = "zpay_popup_dismissed_"

function isDismissed(item: PopupAnnouncement): boolean {
  if (typeof window === "undefined") return true
  const key = DISMISSED_KEY_PREFIX + item.id
  const store = item.showOnce ? window.localStorage : window.sessionStorage
  return store.getItem(key) === "1"
}

function markDismissed(item: PopupAnnouncement) {
  if (typeof window === "undefined") return
  const key = DISMISSED_KEY_PREFIX + item.id
  const store = item.showOnce ? window.localStorage : window.sessionStorage
  store.setItem(key, "1")
}

export function DashboardPopupAnnouncement() {
  const [popup, setPopup] = useState<PopupAnnouncement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch("/api/dashboard-announcement", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        const popups: PopupAnnouncement[] = data.popups ?? []
        const next = popups.find((p) => !isDismissed(p))
        if (!cancelled && next) setPopup(next)
      } catch {
        // silent — popup is non-critical, dashboard should never break on this
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!popup) return null
  if (!popup.text && !popup.imageUrl) return null

  function handleDismiss() {
    if (popup) markDismissed(popup)
    setPopup(null)
  }

  const body = (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: popup.backgroundColor || "#0F1E4D" }}
    >
      {popup.imageUrl && (
        <img src={popup.imageUrl} alt={popup.text ?? "Announcement"} className="block h-auto w-full" />
      )}
      {popup.text && (
        <div className="px-5 py-4">
          <p className="whitespace-pre-wrap text-sm font-medium leading-snug text-white sm:text-base">{popup.text}</p>
        </div>
      )}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={handleDismiss}
    >
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="Close announcement"
          onClick={handleDismiss}
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-secondary shadow-md hover:bg-muted"
        >
          ×
        </button>
        {popup.linkUrl ? (
          <Link href={popup.linkUrl} onClick={handleDismiss} className="block">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
