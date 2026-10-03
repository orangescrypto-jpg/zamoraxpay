// app/api/adsense-config/route.ts
// Public, unauthenticated endpoint. AdSense publisher IDs and slot IDs
// are not secret — they're visible in the rendered page's HTML/script
// tag to any visitor and to Google's own crawler anyway — so serving
// them here (instead of hardcoding them client-side) is what lets the
// admin toggle ads or rotate slot IDs without a redeploy.

import { NextResponse } from "next/server"
import { getSetting, getSettingBoolean } from "@/src/services/siteSettings"

// Was uncached: AdSenseSlot fetches this client-side on mount, and Footer
// (which renders it) is in SiteChrome — i.e. on EVERY non-admin page view.
// That meant a full function invocation + DB read per page view, site-wide.
// These values change rarely (an admin toggling ads or rotating a slot id),
// so cache aggressively at the CDN/browser and let the admin save action
// bust it manually if an instant update is ever needed.
// Renders per request: reads D1 at runtime, not at build time.
export const dynamic = "force-dynamic"

export const revalidate = 3600 // Next's data cache / ISR hint for this route

export async function GET() {
  const [enabled, clientId, homepageFooterSlot, blogPostSlot] = await Promise.all([
    getSettingBoolean("adsense_enabled", false),
    getSetting("adsense_client_id"),
    getSetting("adsense_homepage_footer_slot"),
    getSetting("adsense_blog_post_slot"),
  ])

  return NextResponse.json(
    {
      enabled,
      clientId: clientId ?? "",
      slots: {
        homepage_footer: homepageFooterSlot ?? "",
        blog_post: blogPostSlot ?? "",
      },
    },
    {
      headers: {
        // Browser/CDN can serve this for an hour, and keep serving a stale
        // copy for up to a day while revalidating in the background — so a
        // settings change still propagates within minutes in practice, not
        // just once an hour on the dot.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  )
}
