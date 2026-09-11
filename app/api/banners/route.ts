// app/api/banners/route.ts
// Public route — the storefront header slider and footer read active,
// currently-in-window banners from here. No auth required.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/db"

// D1 returns raw snake_case columns; the client-side Banner type (and
// every consumer of this route) expects camelCase. Map explicitly here
// rather than relying on callers to know the DB's column names.
function mapBannerRow(row: any) {
  return {
    id: row.id,
    placement: row.placement,
    title: row.title,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    sortOrder: row.sort_order,
  }
}

export async function GET(req: NextRequest) {
  const placement = req.nextUrl.searchParams.get("placement") // 'header_slider' | 'footer'

  const now = new Date().toISOString()
  const sql = placement
    ? `SELECT id, title, image_url, link_url, sort_order FROM banners
       WHERE placement = ? AND is_active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY sort_order ASC`
    : `SELECT id, placement, title, image_url, link_url, sort_order FROM banners
       WHERE is_active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY placement, sort_order ASC`

  const params = placement ? [placement, now, now] : [now, now]
  const result = await d1Query(sql, params)

  const banners = (result.results ?? []).map(mapBannerRow)
  return NextResponse.json({ banners })
}
