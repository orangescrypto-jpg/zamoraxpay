// components/shared/PWAInstallBanner.tsx
// Lightweight "Add to Home Screen" prompt for supporting browsers.
// Listens for the browser's beforeinstallprompt event (Chrome/Edge/
// Android), stashes it, and shows a dismissible bottom banner offering
// to install the PWA. Silently renders nothing on browsers that don't
// fire the event (iOS Safari, already-installed apps, etc.) - this is
// a progressive enhancement, not a requirement.
//
// Consolidated dismiss: previously this banner used its own
// `zamoraxpay:pwa-install-dismissed` boolean flag, while usePWA.ts used
// `zamoraxpay_pwa_dismissed_at` (timestamp + TTL). They were never
// synced, so a user could dismiss this banner and still get a
// re-prompt from the other system on the next session. Now this
// banner delegates to `usePWA.dismiss()` so both stay in sync. The
// TTL is 14 days - if the user dismisses, they won't see this banner
// again for 2 weeks (matches the usePWA.ts canShow default).

"use client"

import { useEffect, useState } from "react"
import { useInstallPrompt } from "@/hooks/usePWA"

// 14-day cooldown after dismissal. Long enough that the user won't be
// nagged weekly; short enough that they'll see it again if they
// initially dismissed by mistake.
const DISMISS_RESHOW_SEC = 14 * 24 * 60 * 60

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export default function PWAInstallBanner() {
  // useInstallPrompt already wires beforeinstallprompt + appinstalled
  // listeners AND manages the dismissed-at timestamp. We just consume
  // its state instead of duplicating the storage logic here.
  const { canShow, dismiss, install } = useInstallPrompt()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Gate on canShow so we honour the 14-day cooldown.
    if (!canShow(DISMISS_RESHOW_SEC)) return

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)

    function handleAppInstalled() {
      setVisible(false)
      setDeferredPrompt(null)
    }
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow])

  async function handleInstall() {
    if (!deferredPrompt) {
      // Fall back to the usePWA install path (which itself checks
      // deferredPrompt - if both are missing, this is a no-op).
      await install()
      setVisible(false)
      return
    }
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  function handleDismiss() {
    setVisible(false)
    // Delegate to usePWA.dismiss() so the timestamp is recorded and
    // both systems stay in sync. Also clears the stashed prompt so a
    // re-prompt only happens after the cooldown.
    dismiss()
  }

  if (!visible || !deferredPrompt) return null

  return (
    <div
      role="dialog"
      aria-label="Install ZamoraxPay app"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:rounded-xl sm:border"
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
