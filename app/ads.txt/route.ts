// app/ads.txt/route.ts
// Serves /ads.txt using the AdSense publisher ID stored in site_settings
// (adsense_client_id), so it is never hardcoded and updates when you
// change the ID in the admin panel.
import { getSetting } from "@/src/services/siteSettings"

export const revalidate = 300

export async function GET() {
  const raw = (await getSetting("adsense_client_id")) ?? ""
  // Stored as "ca-pub-1234567890123456"; ads.txt wants "pub-1234567890123456".
  const publisherId = String(raw).trim().replace(/^ca-/, "")

  if (!/^pub-\d{10,20}$/.test(publisherId)) {
    return new Response("# ads.txt not configured yet\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
