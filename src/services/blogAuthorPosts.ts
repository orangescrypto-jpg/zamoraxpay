// src/services/blogAuthorPosts.ts
// Published posts for a blog author profile page. Keeps D1 access out of the
// app/ page layer.

import { d1Query } from "@/lib/d1"

export interface PublishedPostSummary {
  slug: string
  title: string
  excerpt: string | null
  coverImageUrl: string | null
  publishedAt: string | null
}

export async function listPublishedPostsByAuthor(authorId: string, nativeDB?: any): Promise<PublishedPostSummary[]> {
  const result = await d1Query(
    `SELECT slug, title, excerpt, cover_image_url, published_at
     FROM blog_posts WHERE author_id = ? AND status = 'published' ORDER BY published_at DESC`,
    [authorId],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImageUrl: r.cover_image_url,
    publishedAt: r.published_at,
  }))
}
