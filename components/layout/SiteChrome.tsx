// components/layout/SiteChrome.tsx
"use client"

import { usePathname } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import PWAInstallBanner from "@/components/shared/PWAInstallBanner"
import { EnableNotificationsBanner } from "@/components/shared/EnableNotificationsBanner"
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner"
import WhatsAppSupportButton from "@/components/shared/WhatsAppSupportButton"
import { ConnectionStatus } from "@/components/layout/ConnectionStatus"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { ServiceChrome } from "@/components/dashboard/ServiceChrome"
import { ToastProvider, useToast } from "@/components/shared/ToastProvider"
import { LocalExperienceTools } from "@/components/shared/LocalExperienceTools"
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace"
import { ThemeProvider } from "@/components/theme-provider"
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate"
import { useEffect, useState } from "react"
import { RotateCw, X } from "lucide-react"

/**
 * Renders a dismissible "New version available" toast when the
 * service worker detects an update. Lives inside SiteChrome so it's
 * available on every page. Auto-dismissed when the user clicks
 * "Reload" - we never auto-reload because that would interrupt a
 * purchase mid-flight.
 */
function ServiceWorkerUpdateToast() {
  const { updateReady, applyUpdate, dismiss } = useServiceWorkerUpdate()
  const toast = useToast()
  const [dismissed, setDismissed] = useState(false)

  // When the update is ready, surface it via the toast system AND a
  // sticky banner. The toast auto-dismisses after 2.2s; the sticky
  // banner stays until the user acts on it.
  useEffect(() => {
    if (updateReady && !dismissed) {
      toast("A new version of ZamoraxPay is available.", "info")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateReady])

  if (!updateReady || dismissed) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-20 z-[180] mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-popover sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <RotateCw className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-secondary">Update available</p>
        <p className="text-xs text-muted-foreground">Reload to get the latest version.</p>
      </div>
      <button
        type="button"
        onClick={() => { setDismissed(true); dismiss(); applyUpdate() }}
        className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => { setDismissed(true); dismiss() }}
        aria-label="Dismiss update notification"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// The admin section has its own topbar/sidebar (see app/(admin)/layout.tsx).
// Keep the public secondary chrome out of admin pages.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin")

  if (isAdmin) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <Header />
          <main id="main-content" className="min-h-screen">
            {children}
          </main>
          <ServiceWorkerUpdateToast />
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
    <ToastProvider>
      <PWAInstallBanner />
      <EnableNotificationsBanner />
      <ConnectionStatus />
      <Header />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-secondary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white">Skip to content</a>
      <main id="main-content" className="min-h-screen pb-16 md:pb-0">
        <DashboardWorkspace />
        <ServiceChrome>{children}</ServiceChrome>
      </main>
      <MobileBottomNav />
      <Footer />
      <CookieConsentBanner />
      <WhatsAppSupportButton />
      <LocalExperienceTools />
      <ServiceWorkerUpdateToast />
    </ToastProvider>
    </ThemeProvider>
  )
}
