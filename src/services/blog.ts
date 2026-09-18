// src/services/blog.ts
// Service abstraction layer — blog posts.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import { broadcastPush } from "@/src/services/pushNotifications"

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
  sendPush: boolean
  pushSentAt: string | null
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
    sendPush: !!r.send_push,
    pushSentAt: r.push_sent_at,
  }
}

export async function listPublishedPosts(category?: string, nativeDB?: any): Promise<BlogPost[]> {
  const sql = category
    ? "SELECT * FROM blog_posts WHERE status = 'published' AND category = ? ORDER BY published_at DESC"
    : "SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC"
  const result = await d1Query(sql, category ? [category] : [], nativeDB)
  return (result.results ?? []).map(mapRow)
}

export interface PaginatedPosts {
  posts: BlogPost[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
}

export async function listPublishedPostsPaginated(
  category?: string,
  page: number = 1,
  pageSize: number = 30,
  nativeDB?: any,
): Promise<PaginatedPosts> {
  const safePage = Math.max(1, page)
  const offset = (safePage - 1) * pageSize

  const countSql = category
    ? "SELECT COUNT(*) as count FROM blog_posts WHERE status = 'published' AND category = ?"
    : "SELECT COUNT(*) as count FROM blog_posts WHERE status = 'published'"
  const countResult = await d1Query(countSql, category ? [category] : [], nativeDB)
  const totalCount = Number(countResult.results?.[0]?.count ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const sql = category
    ? "SELECT * FROM blog_posts WHERE status = 'published' AND category = ? ORDER BY published_at DESC LIMIT ? OFFSET ?"
    : "SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ? OFFSET ?"
  const params = category ? [category, pageSize, offset] : [pageSize, offset]
  const result = await d1Query(sql, params, nativeDB)

  return {
    posts: (result.results ?? []).map(mapRow),
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
  }
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
    sendPush?: boolean
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<string> {
  const id = randomUUID()
  await d1Query(
    `INSERT INTO blog_posts
      (id, slug, title, excerpt, content_markdown, cover_image_url, category, status, author_name, meta_description, published_at, created_by, send_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      params.sendPush ? 1 : 0,
    ],
    nativeDB,
  )

  // Fire the broadcast immediately if this post is being created
  // already-published with the notify flag checked — createPost is the
  // only path for a brand-new post to go live, so there's no separate
  // "just published" transition to catch the way updatePost has to.
  if (params.status === "published" && params.sendPush) {
    await broadcastPostPublished(id, params.title, params.excerpt ?? null, params.slug, params.coverImageUrl ?? null, nativeDB)
  }

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
    sendPush: boolean
  }>,
  nativeDB?: any,
): Promise<void> {
  // Read current status BEFORE the update so we know if this save is
  // keeping the post published (status omitted on this call) vs a
  // fresh publish (status explicitly set to "published" here).
  const before = await d1Query("SELECT status, send_push, push_sent_at FROM blog_posts WHERE id = ?", [id], nativeDB)
  const beforeRow = before.results?.[0] as any
  const wasPublished = beforeRow?.status === "published"

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

  if (updates.sendPush !== undefined) {
    sets.push("send_push = ?")
    values.push(updates.sendPush ? 1 : 0)
  }

  if (updates.status === "published") {
    sets.push("published_at = COALESCE(published_at, datetime('now'))")
  }

  if (sets.length === 0) return

  sets.push("updated_at = datetime('now')")
  values.push(id)

  await d1Query(`UPDATE blog_posts SET ${sets.join(", ")} WHERE id = ?`, values, nativeDB)

  // Broadcast whenever this save leaves the post published AND the admin
  // explicitly checked "send push" on THIS save (updates.sendPush === true).
  // Unlike createPost's one-shot case, edits can re-notify every time the
  // box is checked — the admin controls it directly, so no once-per-post
  // guard here. Carrying over an old checked flag from a previous save
  // does NOT re-fire; only an explicit true on this request does.
  const isPublished = updates.status === "published" || (wasPublished && updates.status === undefined)
  const wantsPushNow = updates.sendPush === true

  if (isPublished && wantsPushNow) {
    const row = await d1Query("SELECT title, excerpt, slug, cover_image_url FROM blog_posts WHERE id = ?", [id], nativeDB)
    const post = row.results?.[0] as any
    if (post) {
      await broadcastPostPublished(id, post.title, post.excerpt, post.slug, post.cover_image_url, nativeDB)
    }
  }
}

/**
 * Sends "new post published" to every subscribed device site-wide and
 * marks push_sent_at so neither createPost nor updatePost fire it again
 * for this post. Best-effort — if broadcastPush fails (VAPID not
 * configured, etc.) the post save itself has already succeeded, so this
 * only logs rather than throwing back through to the caller.
 */
async function broadcastPostPublished(
  id: string,
  title: string,
  excerpt: string | null,
  slug: string,
  coverImageUrl: string | null,
  nativeDB?: any,
): Promise<void> {
  try {
    await broadcastPush(
      {
        title: "New on the ZamoraxPay blog",
        body: excerpt || title,
        url: `/blog/${slug}`,
        tag: `blog-${id}`,
        image: coverImageUrl ?? undefined,
      },
      nativeDB,
    )
  } catch (err) {
    console.error("broadcastPostPublished failed for post", id, err)
  } finally {
    // Mark sent even on failure so a misconfigured VAPID key doesn't
    // cause a retry storm on every subsequent edit of this post — an
    // admin can always re-check the box on a fresh publish if needed.
    await d1Query("UPDATE blog_posts SET push_sent_at = datetime('now') WHERE id = ?", [id], nativeDB)
  }
}

export async function deletePost(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM blog_posts WHERE id = ?", [id], nativeDB)
}
