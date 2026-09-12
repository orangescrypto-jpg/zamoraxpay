// components/shared/AdSenseLoader.tsx
"use client"

// Loads the Google AdSense script once, site-wide, but only on public
// pages (marketing pages, homepage, blog). It is mounted in the root
// layout so it renders for every route, but bails out on
// dashboard/admin routes since those are gated, logged-in surfaces
// where ads should never show and the AdSense crawler should never
// need to look.
//
// clientId and enabled come from site_settings (adsense_enabled,
// adsense_client_id) so the publisher ID lives in the database, not
// hardcoded, and can be turned off instantly from the admin UI.

import { useEffect, useState } from "react"
import Script from "next/script"
import { usePathname } from "next/navigation"

export function AdSenseLoader() {
  const pathname = usePathname()
  const [config, setConfig] = useState<{ enabled: boolean; clientId: string } | null>(null)

  useEffect(() => {
    fetch("/api/adsense-config")
      .then((res) => res.json())
      .then((data) => setConfig({ enabled: !!data.enabled, clientId: data.clientId ?? "" }))
      .catch(() => setConfig({ enabled: false, clientId: "" }))
  }, [])

  const isDashboardOrAdmin = pathname?.startsWith("/admin") || isDashboardPath(pathname)

  if (!config || !config.enabled || !config.clientId || isDashboardOrAdmin) return null

  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.clientId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  )
}

// The (dashboard) route group has no shared /dashboard-prefixed path,
// its routes hang directly off "/" (e.g. /wallet, /services/airtime),
// so we match by the same route list the app already treats as
// logged-in-only rather than a single prefix.
const DASHBOARD_PATHS = [
  "/dashboard",
  "/wallet",
  "/services",
  "/history",
  "/referrals",
  "/rewards",
  "/reseller",
  "/settings",
  "/beneficiaries",
  "/daily-streak",
  "/cashback",
  "/refund",
]

function isDashboardPath(pathname: string | null) {
  if (!pathname) return false
  return DASHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
