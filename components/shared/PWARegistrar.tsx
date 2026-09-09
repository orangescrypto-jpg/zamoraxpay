// components/shared/PWAInstallBanner.tsx
"use client"

import { useState } from "react"
import { useInstallPrompt } from "@/hooks/usePWA"

// How long to hide the banner after a manual dismiss (24 hours).
const RESHOW_AFTER_SEC = 60 * 60 * 24

export default function PWAInstallBanner() {
  const { canInstall, isInstalled, isIOS, isMobile, checked, canShow, install, dismiss } = useInstallPrompt()
  const [showIOSSheet, setShowIOSSheet] = useState(false)

  // Don't render anything until we've actually checked install state —
  // rendering with the default "not installed" value for even one frame
  // is what causes the banner to flash before disappearing.
  if (!checked) return null

  // Never show once installed, or if the user dismissed it recently.
  if (isInstalled) return null
  if (!canShow(RESHOW_AFTER_SEC)) return null

  const handleInstallClick = async () => {
    if (canInstall) {
      // Chrome / Android / Edge — native install prompt.
      await install()
      return
    }
    // iOS Safari (and any browser without beforeinstallprompt) — show manual steps.
    setShowIOSSheet(true)
  }

  const handleDismiss = () => {
    setShowIOSSheet(false)
    dismiss()
  }

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-primary px-4 py-2 text-primary-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/15">
            <img src="/icon-192.png" alt="" className="h-5 w-5 rounded-sm" />
          </span>
          <p className="truncate text-sm font-medium">
            {isMobile ? "Install the ZamoraxPay app for faster access" : "Install ZamoraxPay on this device"}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleInstallClick}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:opacity-90"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="flex h-7 w-7 items-center justify-center rounded-md text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground"
          >
            ✕
          </button>
        </div>
      </div>

      {showIOSSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowIOSSheet(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-heading font-bold text-secondary">
              Install ZamoraxPay
            </h3>
            {isIOS ? (
              <ol className="mb-4 space-y-2 text-sm text-secondary">
                <li>1. Tap the Share icon in Safari's toolbar.</li>
                <li>2. Scroll down and tap "Add to Home Screen".</li>
                <li>3. Tap "Add" to finish.</li>
              </ol>
            ) : (
              <ol className="mb-4 space-y-2 text-sm text-secondary">
                <li>1. Open your browser menu (usually the ⋮ or ⋯ icon).</li>
                <li>2. Choose "Add to Home Screen" or "Install App".</li>
                <li>3. Confirm to finish installing.</li>
              </ol>
            )}
            <button
              onClick={handleDismiss}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
