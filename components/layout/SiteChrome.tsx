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

// The admin section has its own topbar/sidebar (see app/(admin)/layout.tsx).
// Keep the public secondary chrome out of admin pages.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin")

  if (isAdmin) {
    return (
      <>
        <Header />
        <main className="min-h-screen">
          {children}
        </main>
      </>
    )
  }

  return (
    <>
      <PWAInstallBanner />
      <EnableNotificationsBanner />
      <ConnectionStatus />
      <Header />
      <main className="min-h-screen pb-16 md:pb-0">
        <ServiceChrome>{children}</ServiceChrome>
      </main>
      <MobileBottomNav />
      <Footer />
      <CookieConsentBanner />
      <WhatsAppSupportButton />
    </>
  )
}
