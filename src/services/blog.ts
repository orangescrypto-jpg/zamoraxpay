// src/services/blog.ts
// Service abstraction layer — blog posts.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  contentMarkdown: string
  coverImageUrl: string | null
  category: string | null
  status: "draft" | "published"
  authorName: string | null
  metaDescription: string | null
  publishedAt: string | null
}

function mapRow(r: any): BlogPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    contentMarkdown: r.content_markdown,
    coverImageUrl: r.cover_image_url,
    category: r.category,
    status: r.status,
    authorName: r.author_name,
    metaDescription: r.meta_description,
    publishedAt: r.published_at,
  }
}

export async function listPublishedPosts(category?: string, nativeDB?: any): Promise<BlogPost[]> {
  const sql = category
    ? "SELECT * FROM blog_posts WHERE status = 'published' AND category = ? ORDER BY published_at DESC"
    : "SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC"
  const result = await d1Query(sql, category ? [category] : [], nativeDB)
  return (result.results ?? []).map(mapRow)
}

export async function getPostBySlug(slug: string, nativeDB?: any): Promise<BlogPost | null> {
  const result = await d1Query("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'", [slug], nativeDB)
  const row = result.results?.[0]
  return row ? mapRow(row) : null
}

export async function getRelatedPosts(post: BlogPost, limit: number, nativeDB?: any): Promise<BlogPost[]> {
  // Prefer same-category posts first, then fill any remaining slots
  // with the most recent other published posts, so a post in a
  // sparsely-populated category still gets related posts shown.
  const sameCategory = post.category
    ? await d1Query(
        `SELECT * FROM blog_posts
         WHERE status = 'published' AND category = ? AND id != ?
         ORDER BY published_at DESC LIMIT ?`,
        [post.category, post.id, limit],
        nativeDB,
      )
    : { results: [] as any[] }

  const sameCategoryPosts = (sameCategory.results ?? []).map(mapRow)

  if (sameCategoryPosts.length >= limit) {
    return sameCategoryPosts.slice(0, limit)
  }

  const remaining = limit - sameCategoryPosts.length
  const excludeIds = [post.id, ...sameCategoryPosts.map((p: BlogPost) => p.id)]
  const placeholders = excludeIds.map(() => "?").join(",")

  const others = await d1Query(
    `SELECT * FROM blog_posts
     WHERE status = 'published' AND id NOT IN (${placeholders})
     ORDER BY published_at DESC LIMIT ?`,
    [...excludeIds, remaining],
    nativeDB,
  )

  return [...sameCategoryPosts, ...(others.results ?? []).map(mapRow)]
}

export async function listAllPostsAdmin(nativeDB?: any): Promise<BlogPost[]> {
  const result = await d1Query("SELECT * FROM blog_posts ORDER BY created_at DESC", [], nativeDB)
  return (result.results ?? []).map(mapRow)
}

export async function createPost(
  params: {
    slug: string
    title: string
    excerpt?: string
    contentMarkdown: string
    coverImageUrl?: string
    category?: string
    authorName?: string
    metaDescription?: string
    status: "draft" | "published"
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<string> {
  const id = randomUUID()
  await d1Query(
    `INSERT INTO blog_posts
      (id, slug, title, excerpt, content_markdown, cover_image_url, category, status, author_name, meta_description, published_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.slug,
      params.title,
      params.excerpt ?? null,
      params.contentMarkdown,
      params.coverImageUrl ?? null,
      params.category ?? null,
      params.status,
      params.authorName ?? null,
      params.metaDescription ?? null,
      params.status === "published" ? new Date().toISOString() : null,
      adminUserId,
    ],
    nativeDB,
  )
  return id
}

export async function updatePost(
  id: string,
  updates: Partial<{
    title: string
    excerpt: string
    contentMarkdown: string
    coverImageUrl: string
    category: string
    authorName: string
    metaDescription: string
    status: "draft" | "published"
  }>,
  nativeDB?: any,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  const fieldMap: Record<string, string> = {
    title: "title",
    excerpt: "excerpt",
    contentMarkdown: "content_markdown",
    coverImageUrl: "cover_image_url",
    category: "category",
    authorName: "author_name",
    metaDescription: "meta_description",
    status: "status",
  }

  for (const [key, column] of Object.entries(fieldMap)) {
    if ((updates as any)[key] !== undefined) {
      sets.push(`${column} = ?`)
      values.push((updates as any)[key])
    }
  }

  if (updates.status === "published") {
    sets.push("published_at = COALESCE(published_at, datetime('now'))")
  }

  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  values.push(id)

  await d1Query(`UPDATE blog_posts SET ${sets.join(", ")} WHERE id = ?`, values, nativeDB)
}

export async function deletePost(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM blog_posts WHERE id = ?", [id], nativeDB)
}
