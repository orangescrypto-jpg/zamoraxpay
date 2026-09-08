// app/api/admin/pages/route.ts
// Admin edit access to every legal/static page (Privacy Policy, Terms,
// Cookie Policy, About, Contact, Refund Policy). Pages are seeded with
// real content in migrations/schema.sql; this route lets admin change
// any of it afterward with no redeploy.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM site_pages ORDER BY slug")
  return NextResponse.json({ pages: result.results ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { slug, title, contentMarkdown, metaDescription } = await req.json()
    if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 })

    const sets: string[] = []
    const values: unknown[] = []

    if (title !== undefined) { sets.push("title = ?"); values.push(title) }
    if (contentMarkdown !== undefined) { sets.push("content_markdown = ?"); values.push(contentMarkdown) }
    if (metaDescription !== undefined) { sets.push("meta_description = ?"); values.push(metaDescription) }

    if (sets.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

    sets.push("updated_by = ?", "updated_at = datetime('now')")
    values.push(auth.uid, slug)

    await d1Query(`UPDATE site_pages SET ${sets.join(", ")} WHERE slug = ?`, values)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
