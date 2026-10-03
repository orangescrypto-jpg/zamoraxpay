// app/ads.txt/route.ts
// Serves /ads.txt using the AdSense publisher ID stored in site_settings
// (adsense_client_id), so it is never hardcoded and updates when you
// change the ID in the admin panel.
//
// force-dynamic: the value comes from D1, which is not available while
// `next build` runs on Cloudflare. The route is rendered per request and
// cached at the edge via Cache-Control instead.
import { getSetting } from "@/src/services/siteSettings"

export const dynamic = "force-dynamic"

const CACHE = "public, s-maxage=300, stale-while-revalidate=600"

export async function GET() {
  const raw = (await getSetting("adsense_client_id")) ?? ""
  // Stored as "ca-pub-1234567890123456"; ads.txt wants "pub-1234567890123456".
  const publisherId = String(raw).trim().replace(/^ca-/, "")

  if (!/^pub-\d{10,20}$/.test(publisherId)) {
    return new Response("# ads.txt not configured yet\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": CACHE },
    })
  }

  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": CACHE },
  })
}
