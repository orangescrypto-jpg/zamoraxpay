// app/api/adsense-config/route.ts
// Public, unauthenticated endpoint. AdSense publisher IDs and slot IDs
// are not secret — they're visible in the rendered page's HTML/script
// tag to any visitor and to Google's own crawler anyway — so serving
// them here (instead of hardcoding them client-side) is what lets the
// admin toggle ads or rotate slot IDs without a redeploy.

import { NextResponse } from "next/server"
import { getSetting, getSettingBoolean } from "@/src/services/siteSettings"

export async function GET() {
  const [enabled, clientId, homepageFooterSlot, blogPostSlot] = await Promise.all([
    getSettingBoolean("adsense_enabled", false),
    getSetting("adsense_client_id"),
    getSetting("adsense_homepage_footer_slot"),
    getSetting("adsense_blog_post_slot"),
  ])

  return NextResponse.json({
    enabled,
    clientId: clientId ?? "",
    slots: {
      homepage_footer: homepageFooterSlot ?? "",
      blog_post: blogPostSlot ?? "",
    },
  })
}
