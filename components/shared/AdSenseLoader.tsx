// components/shared/AdSenseLoader.tsx
// Server component — no "use client", no client-side fetch. Reads the
// AdSense config directly from site_settings at request/render time
// and renders the script tag straight into the HTML that gets sent to
// the browser (and to crawlers). This matters because AdSense's
// "verify site ownership" crawler reads the raw HTML response and
// does not reliably wait for client-side JavaScript to fetch config
// and inject a script tag after the fact — a client-only version of
// this component would never be seen by that crawler.
//
// clientId and enabled come from site_settings (adsense_enabled,
// adsense_client_id) so the publisher ID lives in the database, not
// hardcoded, and can be turned off instantly from the admin UI.

import { headers } from "next/headers"
import { getSetting, getSettingBoolean } from "@/src/services/siteSettings"
import { isPrivatePath } from "@/lib/privateRoutes"

export async function AdSenseLoader() {
  const headerList = await headers()
  const pathname = headerList.get("x-pathname")

  // Never load the AdSense script at all on authenticated app pages,
  // the admin panel, or the login/signup forms. These are noindex'd,
  // never seen by any crawler, and on the dashboard/admin side may be
  // showing a logged-in user's real account/transaction data — not a
  // page you want an ad script (or, later, an ad unit) anywhere near.
  if (isPrivatePath(pathname)) return null

  const [enabled, clientId] = await Promise.all([
    getSettingBoolean("adsense_enabled", false),
    getSetting("adsense_client_id"),
  ])

  if (!enabled || !clientId) return null

  return (
    <script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
    />
  )
}
