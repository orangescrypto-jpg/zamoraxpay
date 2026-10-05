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
  authorId: string | null
  // Populated only when the query joins blog_authors (see mapRowWithAuthor) —
  // undefined otherwise, distinct from an explicitly-linked-but-inactive author.
  authorSlug?: string | null
  authorPhotoUrl?: string | null
  authorBio?: string | null
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
    authorId: r.author_id ?? null,
    metaDescription: r.meta_description,
    publishedAt: r.published_at,
    sendPush: !!r.send_push,
    pushSentAt: r.push_sent_at,
  }
}

// Same as mapRow, plus the linked author's slug/photo when the caller's
// SQL joins blog_authors as `a` (see getPostBySlug). Used so the public
// post page can link the byline to /blog/authors/[slug] and show a photo
// without a second round-trip query.
function mapRowWithAuthor(r: any): BlogPost {
  return {
    ...mapRow(r),
    authorSlug: r.author_slug ?? null,
    authorPhotoUrl: r.author_photo_url ?? null,
    authorBio: r.author_bio ?? null,
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

  // Public blog cards never need the full article body. Keep the BlogPost
  // shape for existing callers, but deliberately omit content_markdown and
  // the admin/push-only fields from the D1 read.
  const sql = category
    ? `SELECT id, slug, title, excerpt, cover_image_url, category, status,
              author_name, author_id, meta_description, published_at,
              0 AS send_push, NULL AS push_sent_at, '' AS content_markdown
         FROM blog_posts
        WHERE status = 'published' AND category = ?
        ORDER BY published_at DESC LIMIT ? OFFSET ?`
    : `SELECT id, slug, title, excerpt, cover_image_url, category, status,
              author_name, author_id, meta_description, published_at,
              0 AS send_push, NULL AS push_sent_at, '' AS content_markdown
         FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC LIMIT ? OFFSET ?`
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

/**
 * Latest published posts for each of the given category slugs, in one
 * batch — used for the homepage's magazine-style "one row per
 * category" layout so it doesn't issue a separate round-trip per
 * category. Categories with zero published posts are simply absent
 * from the returned map (caller decides whether to render the row).
 */
export interface BlogCardPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImageUrl: string | null
  category: string | null
  publishedAt: string | null
}

/**
 * Homepage-only blog cards. This intentionally does NOT return full article
 * content, and it uses one window-function query for all requested categories.
 * The homepage still renders the same category sections and number of posts,
 * but avoids one D1 query per category and avoids reading content_markdown,
 * metadata, push fields, and other article-only columns.
 */
export async function listLatestPostsByCategories(
  categorySlugs: string[],
  limitPerCategory: number,
  nativeDB?: any,
): Promise<Record<string, BlogCardPost[]>> {
  if (categorySlugs.length === 0 || limitPerCategory <= 0) return {}

  const placeholders = categorySlugs.map(() => "?").join(",")
  const result = await d1Query(
    `SELECT id, slug, title, excerpt, cover_image_url, category, published_at
       FROM (
         SELECT id, slug, title, excerpt, cover_image_url, category, published_at,
                ROW_NUMBER() OVER (PARTITION BY category ORDER BY published_at DESC) AS category_rank
           FROM blog_posts
          WHERE status = 'published'
            AND category IN (${placeholders})
       )
      WHERE category_rank <= ?
      ORDER BY category, published_at DESC`,
    [...categorySlugs, limitPerCategory],
    nativeDB,
  )

  const byCategory: Record<string, BlogCardPost[]> = {}
  for (const row of result.results ?? []) {
    const slug = row.category as string | null
    if (!slug) continue
    ;(byCategory[slug] ??= []).push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt ?? null,
      coverImageUrl: row.cover_image_url ?? null,
      category: slug,
      publishedAt: row.published_at ?? null,
    })
  }

  return byCategory
}

export async function getPostBySlug(slug: string, nativeDB?: any): Promise<BlogPost | null> {
  const result = await d1Query(
    `SELECT p.*, a.slug as author_slug, a.photo_url as author_photo_url, a.bio as author_bio
     FROM blog_posts p
     LEFT JOIN blog_authors a ON a.id = p.author_id
     WHERE p.slug = ? AND p.status = 'published'`,
    [slug],
    nativeDB,
  )
  const row = result.results?.[0]
  return row ? mapRowWithAuthor(row) : null
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
    authorId?: string
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
      (id, slug, title, excerpt, content_markdown, cover_image_url, category, status, author_name, author_id, meta_description, published_at, created_by, send_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      params.authorId ?? null,
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
    authorId: string | null
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
    authorId: "author_id",
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
