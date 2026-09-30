// src/services/blogAuthors.ts
// Service abstraction layer — blog authors (public profile, no login
// account required). Admin/moderator managed, picked as the byline on
// blog posts via a dropdown.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"

export interface BlogAuthor {
  id: string
  slug: string
  name: string
  bio: string | null
  photoUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function mapRow(r: any): BlogAuthor {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    bio: r.bio,
    photoUrl: r.photo_url,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

async function uniqueSlug(base: string, excludeId?: string, nativeDB?: any): Promise<string> {
  const root = base || "author"
  let candidate = root
  for (let i = 2; i < 200; i++) {
    const result = await d1Query("SELECT id FROM blog_authors WHERE slug = ?", [candidate], nativeDB)
    const row = result.results?.[0] as any
    if (!row || row.id === excludeId) return candidate
    candidate = `${root}-${i}`
  }
  return `${root}-${randomUUID().slice(0, 6)}`
}

function clean(value: string | undefined | null, max: number): string | null {
  const v = (value ?? "").trim()
  return v ? v.slice(0, max) : null
}

export async function listAuthors(opts: { activeOnly?: boolean } = {}, nativeDB?: any): Promise<BlogAuthor[]> {
  const sql = opts.activeOnly
    ? "SELECT * FROM blog_authors WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC"
    : "SELECT * FROM blog_authors ORDER BY name COLLATE NOCASE ASC"
  const result = await d1Query(sql, [], nativeDB)
  return (result.results ?? []).map(mapRow)
}

export async function getAuthorById(id: string, nativeDB?: any): Promise<BlogAuthor | null> {
  const result = await d1Query("SELECT * FROM blog_authors WHERE id = ?", [id], nativeDB)
  const row = result.results?.[0]
  return row ? mapRow(row) : null
}

export async function getAuthorBySlug(slug: string, nativeDB?: any): Promise<BlogAuthor | null> {
  const result = await d1Query("SELECT * FROM blog_authors WHERE slug = ? AND is_active = 1", [slug], nativeDB)
  const row = result.results?.[0]
  return row ? mapRow(row) : null
}

export async function createAuthor(
  params: { name: string; bio?: string; photoUrl?: string; isActive?: boolean },
  createdBy: string,
  nativeDB?: any,
): Promise<BlogAuthor> {
  const name = clean(params.name, 120)
  if (!name) throw new Error("Name is required")

  const id = randomUUID()
  const slug = await uniqueSlug(slugify(name), undefined, nativeDB)

  await d1Query(
    `INSERT INTO blog_authors (id, slug, name, bio, photo_url, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, slug, name, clean(params.bio, 2000), clean(params.photoUrl, 500), params.isActive === false ? 0 : 1, createdBy],
    nativeDB,
  )

  const created = await getAuthorById(id, nativeDB)
  if (!created) throw new Error("Failed to create author")
  return created
}

export async function updateAuthor(
  id: string,
  params: { name: string; bio?: string; photoUrl?: string; isActive?: boolean },
  nativeDB?: any,
): Promise<BlogAuthor> {
  const existing = await getAuthorById(id, nativeDB)
  if (!existing) throw new Error("Author not found")

  const name = clean(params.name, 120)
  if (!name) throw new Error("Name is required")

  // Slug only changes when the name actually changed, so existing
  // shared profile links keep working across unrelated bio/photo edits.
  const slug = name === existing.name ? existing.slug : await uniqueSlug(slugify(name), id, nativeDB)

  await d1Query(
    `UPDATE blog_authors SET slug = ?, name = ?, bio = ?, photo_url = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [slug, name, clean(params.bio, 2000), clean(params.photoUrl, 500), params.isActive === false ? 0 : 1, id],
    nativeDB,
  )

  const updated = await getAuthorById(id, nativeDB)
  if (!updated) throw new Error("Failed to update author")
  return updated
}

/**
 * Deleting an author never touches existing posts' free-text author_name —
 * only the structured link (author_id) is cleared, so past posts keep
 * showing a byline, they just lose the linked profile page.
 */
export async function deleteAuthor(id: string, nativeDB?: any): Promise<void> {
  await d1Query("UPDATE blog_posts SET author_id = NULL WHERE author_id = ?", [id], nativeDB)
  await d1Query("DELETE FROM blog_authors WHERE id = ?", [id], nativeDB)
}

export async function countPublishedPostsByAuthor(id: string, nativeDB?: any): Promise<number> {
  const result = await d1Query(
    "SELECT COUNT(*) as c FROM blog_posts WHERE status = 'published' AND author_id = ?",
    [id],
    nativeDB,
  )
  return Number((result.results?.[0] as any)?.c ?? 0)
}
