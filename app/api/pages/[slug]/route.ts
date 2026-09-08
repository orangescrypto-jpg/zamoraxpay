// app/api/pages/[slug]/route.ts
// Public route — fetches a single legal/informational page's current
// content (admin-editable). Used by the (public) route group pages.

import { NextRequest, NextResponse } from "next/server"
import { d1Query } from "@/lib/db"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await d1Query("SELECT * FROM site_pages WHERE slug = ?", [slug])
  const page = result.results?.[0]

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 })

  return NextResponse.json({
    slug: page.slug,
    title: page.title,
    contentMarkdown: page.content_markdown,
    metaDescription: page.meta_description,
  })
}
