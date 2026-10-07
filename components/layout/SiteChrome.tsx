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
import { ToastProvider } from "@/components/shared/ToastProvider"

// The admin section has its own topbar/sidebar (see app/(admin)/layout.tsx).
// Keep the public secondary chrome out of admin pages.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin")

  if (isAdmin) {
    return (
      <>
        <Header />
        <main id="main-content" className="min-h-screen">
          {children}
        </main>
      </>
    )
  }

  return (
    <ToastProvider>
      <PWAInstallBanner />
      <EnableNotificationsBanner />
      <ConnectionStatus />
      <Header />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-secondary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white">Skip to content</a>
      <main id="main-content" className="min-h-screen pb-16 md:pb-0">
        <ServiceChrome>{children}</ServiceChrome>
      </main>
      <MobileBottomNav />
      <Footer />
      <CookieConsentBanner />
      <WhatsAppSupportButton />
    </ToastProvider>
  )
}
