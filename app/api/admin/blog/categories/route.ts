// app/api/admin/blog/categories/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM blog_categories ORDER BY sort_order")
  return NextResponse.json({ categories: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { slug, label, description, sortOrder } = await req.json()
    if (!slug || !label) return NextResponse.json({ error: "slug and label are required" }, { status: 400 })

    await d1Query(
      "INSERT INTO blog_categories (slug, label, description, sort_order) VALUES (?, ?, ?, ?)",
      [slug, label, description ?? null, sortOrder ?? 0],
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create category" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const slug = req.nextUrl.searchParams.get("slug")
  if (!slug) return NextResponse.json({ error: "slug query param is required" }, { status: 400 })

  await d1Query("DELETE FROM blog_categories WHERE slug = ?", [slug])
  return NextResponse.json({ success: true })
}
