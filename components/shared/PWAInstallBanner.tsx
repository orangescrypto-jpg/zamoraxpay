// components/shared/PWAInstallBanner.tsx
// Lightweight "Add to Home Screen" prompt for supporting browsers.
// Listens for the browser's beforeinstallprompt event (Chrome/Edge/
// Android), stashes it, and shows a dismissible bottom banner offering
// to install the PWA. Silently renders nothing on browsers that don't
// fire the event (iOS Safari, already-installed apps, etc.) — this is
// a progressive enhancement, not a requirement.

"use client"

import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

const DISMISS_KEY = "zamoraxpay:pwa-install-dismissed"

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Don't show again this "session" (until localStorage is cleared or
    // the flag expires) if the user already dismissed it once.
    let dismissed = false
    try {
      dismissed = !!localStorage.getItem(DISMISS_KEY)
    } catch {
      // localStorage can throw in private browsing / disabled-storage
      // contexts — treat as "not dismissed" and continue.
    }
    if (dismissed) return

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    // If the app gets installed via another path (e.g. browser menu),
    // hide the banner and drop the stashed prompt.
    function handleAppInstalled() {
      setVisible(false)
      setDeferredPrompt(null)
    }
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    // Result isn't used for anything beyond letting the OS-level
    // install UI resolve — either way we're done with this prompt.
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  function handleDismiss() {
    setVisible(false)
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // localStorage can throw in private browsing / disabled-storage
      // contexts — dismissal just won't persist, which is fine.
    }
  }

  if (!visible || !deferredPrompt) return null

  return (
    <div
      role="dialog"
      aria-label="Install ZamoraxPay app"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white p-4 shadow-lg sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:rounded-xl sm:border"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <path d="M12 3v13" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-secondary">Install ZamoraxPay</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add it to your home screen for quicker access and a faster, app-like experience.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md px-4 py-2 text-xs font-medium text-secondary hover:bg-muted"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-secondary"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
