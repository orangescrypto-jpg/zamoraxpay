// app/api/service-pages/[slug]/route.ts
// Public route — fetches a single service marketing page's current
// content (admin-editable). Used by the (public) /services/[slug] page.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/db"

function safeJsonArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await d1Query("SELECT * FROM service_pages WHERE slug = ?", [slug])
  const page = result.results?.[0]

  if (!page) return NextResponse.json({ error: "Service page not found" }, { status: 404 })

  return NextResponse.json({
    slug: page.slug,
    title: page.title,
    tagline: page.tagline,
    contentMarkdown: page.content_markdown,
    networks: safeJsonArray(page.networks_json),
    pricing: safeJsonArray(page.pricing_json),
    faqs: safeJsonArray(page.faqs_json),
    buyButtonLabel: page.buy_button_label,
    buyButtonHref: page.buy_button_href,
    metaDescription: page.meta_description,
  })
}
