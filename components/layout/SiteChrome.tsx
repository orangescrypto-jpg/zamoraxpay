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
// Rendering the public Footer/WhatsApp button/banners on top of that duplicated
// UI on /admin/* pages. The public Header, however, should still show on admin
// pages (site branding at the top), so only the secondary chrome is skipped there.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin")

  if (isAdmin) {
    return (
      <>
        <Header />
        <main className="min-h-screen">{children}</main>
      </>
    )
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
