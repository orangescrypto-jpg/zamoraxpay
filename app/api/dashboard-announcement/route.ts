// app/api/dashboard-announcement/route.ts
// Read-only route the dashboard page calls to fetch the active
// announcement items (banners AND popups — both live in the same
// dashboard_announcements table, split by display_style). Requires a
// logged-in user since it's only ever rendered on the dashboard —
// mirrors the auth model of other dashboard-data routes like
// /api/wallet/balance.
//
// Filters applied server-side:
//   - is_active = 1
//   - starts_at / ends_at window
//   - audience: 'all' always included; 'retail'/'reseller' only
//     included for users whose users.tier matches
// Popup dismissal (show_once / show_always) is NOT tracked here —
// there is no per-user dismissal table, so that's handled client-side
// in DashboardPopupAnnouncement.tsx. This route always returns popups
// that pass the filters above; the client decides whether to actually
// display one it already recorded as dismissed. show_always items are
// never recorded as dismissed client-side, so they resurface on every
// dashboard load/refresh regardless of login state.

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
  const tier = userResult.results?.[0]?.tier ?? "retail"

  const now = new Date().toISOString()
  const result = await d1Query(
    `SELECT id, text, image_url, link_url, sort_order, display_style, background_color, show_once, show_always
     FROM dashboard_announcements
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
       AND (audience = 'all' OR audience = ?)
     ORDER BY sort_order ASC`,
    [now, now, tier],
  )

  const rows = (result.results ?? []) as any[]

  const toItem = (row: any) => ({
    id: row.id,
    text: row.text,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    backgroundColor: row.background_color,
    showOnce: row.show_once === 1,
    showAlways: row.show_always === 1,
  })

  const announcements = rows.filter((r) => r.display_style !== "popup").map(toItem)
  const popups = rows.filter((r) => r.display_style === "popup").map(toItem)

  return NextResponse.json({ announcements, popups })
}
