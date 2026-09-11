// app/api/dashboard-announcement/route.ts
// Read-only route the dashboard page calls to fetch the active
// announcement slides (shown between wallet balance and Quick
// actions). Requires a logged-in user since it's only ever rendered
// on the dashboard — mirrors the auth model of other dashboard-data
// routes like /api/wallet/balance.

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const now = new Date().toISOString()
  const result = await d1Query(
    `SELECT id, text, image_url, link_url, sort_order FROM dashboard_announcements
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY sort_order ASC`,
    [now, now],
  )

  const announcements = (result.results ?? []).map((row: any) => ({
    id: row.id,
    text: row.text,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
  }))

  return NextResponse.json({ announcements })
}
