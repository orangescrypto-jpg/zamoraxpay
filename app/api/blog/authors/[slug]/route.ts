// app/api/blog/authors/[slug]/route.ts
// Public: author profile + their published posts. No auth required.
import { NextRequest, NextResponse } from "next/server"
import { getAuthorBySlug } from "@/src/services/blogAuthors"
import { d1Query } from "@/lib/d1"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const author = await getAuthorBySlug(slug)
  if (!author) {
    return NextResponse.json({ error: "Author not found" }, { status: 404 })
  }

  const result = await d1Query(
    `SELECT slug, title, excerpt, cover_image_url, published_at
     FROM blog_posts WHERE author_id = ? AND status = 'published' ORDER BY published_at DESC`,
    [author.id],
  )

  const posts = (result.results ?? []).map((r: any) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImageUrl: r.cover_image_url,
    publishedAt: r.published_at,
  }))

  return NextResponse.json({ author, posts })
}
