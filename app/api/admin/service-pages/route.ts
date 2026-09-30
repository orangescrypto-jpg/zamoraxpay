// app/api/admin/service-pages/route.ts
// Admin edit access to every public service marketing page (Airtime,
// Data, Cable, Electricity, Exam PINs, Airtime to Cash, ePIN, Bulk
// Airtime, Bulk Data, International Top-up). Pages are seeded with real
// content in migrations/2026-09-add-service-pages.sql; this route lets
// admin change any of it afterward with no redeploy, mirroring
// app/api/admin/pages/route.ts for site_pages.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM service_pages ORDER BY slug")
  return NextResponse.json({ pages: result.results ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const {
      slug,
      title,
      tagline,
      contentMarkdown,
      networks,
      pricing,
      faqs,
      buyButtonLabel,
      buyButtonHref,
      metaDescription,
    } = await req.json()

    if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 })

    const sets: string[] = []
    const values: unknown[] = []

    if (title !== undefined) { sets.push("title = ?"); values.push(title) }
    if (tagline !== undefined) { sets.push("tagline = ?"); values.push(tagline) }
    if (contentMarkdown !== undefined) { sets.push("content_markdown = ?"); values.push(contentMarkdown) }
    if (networks !== undefined) { sets.push("networks_json = ?"); values.push(JSON.stringify(networks)) }
    if (pricing !== undefined) { sets.push("pricing_json = ?"); values.push(JSON.stringify(pricing)) }
    if (faqs !== undefined) { sets.push("faqs_json = ?"); values.push(JSON.stringify(faqs)) }
    if (buyButtonLabel !== undefined) { sets.push("buy_button_label = ?"); values.push(buyButtonLabel) }
    if (buyButtonHref !== undefined) { sets.push("buy_button_href = ?"); values.push(buyButtonHref) }
    if (metaDescription !== undefined) { sets.push("meta_description = ?"); values.push(metaDescription) }

    if (sets.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

    sets.push("updated_by = ?", "updated_at = datetime('now')")
    values.push(auth.uid, slug)

    await d1Query(`UPDATE service_pages SET ${sets.join(", ")} WHERE slug = ?`, values)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
