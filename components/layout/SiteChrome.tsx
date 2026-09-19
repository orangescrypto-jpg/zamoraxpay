// components/layout/SiteChrome.tsx
"use client"

import { usePathname } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import PWAInstallBanner from "@/components/shared/PWAInstallBanner"
import { EnableNotificationsBanner } from "@/components/shared/EnableNotificationsBanner"
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner"
import WhatsAppSupportButton from "@/components/shared/WhatsAppSupportButton"

// The admin section has its own topbar/sidebar (see app/(admin)/layout.tsx).
// Rendering the public Header/Footer/WhatsApp button on top of that as well
// produced the doubled nav bars and extra floating buttons seen on
// /admin/* pages, especially cramped on mobile. Skip all public chrome
// there instead of duplicating the "is this an admin route" check per page.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin")

  if (isAdmin) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <>
      <PWAInstallBanner />
      <EnableNotificationsBanner />
      <Header />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <CookieConsentBanner />
      <WhatsAppSupportButton />
    </>
  )
}
