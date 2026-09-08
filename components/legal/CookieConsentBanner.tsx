// components/legal/CookieConsentBanner.tsx
"use client"

import { useEffect, useState } from "react"

const CONSENT_COOKIE_NAME = "zamoraxpay_cookie_consent"
const ANON_ID_COOKIE_NAME = "zamoraxpay_anon_id"

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString()
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}

function generateAnonId(): string {
  return "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const existing = getCookie(CONSENT_COOKIE_NAME)
    if (!existing) setVisible(true)
  }, [])

  async function recordConsent(choice: "accepted_all" | "rejected_non_essential") {
    let anonId = getCookie(ANON_ID_COOKIE_NAME)
    if (!anonId) {
      anonId = generateAnonId()
      setCookie(ANON_ID_COOKIE_NAME, anonId, 365)
    }

    setCookie(CONSENT_COOKIE_NAME, choice, 365)
    setVisible(false)

    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: anonId, choice }),
      })
    } catch {
      // Non-blocking — the cookie itself is the source of truth for the UI
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white p-4 shadow-lg">
      <div className="container flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-secondary">
          We use cookies to keep you signed in and improve your experience. See our{" "}
          <a href="/cookie-policy" className="text-primary underline">
            Cookie Policy
          </a>{" "}
          for details.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => recordConsent("rejected_non_essential")}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Reject non-essential
          </button>
          <button
            onClick={() => recordConsent("accepted_all")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
