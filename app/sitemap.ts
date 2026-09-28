// app/sitemap.ts
import type { MetadataRoute } from "next"
import { listPublishedPosts, listPublishedPostsPaginated } from "@/src/services/blog"
import { d1Query } from "@/lib/db"

const POSTS_PER_PAGE = 30

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookie-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ]

  const listingRoutes: MetadataRoute.Sitemap = []
  const postRoutes: MetadataRoute.Sitemap = []

  try {
    // Blog listing pages 2..N
    const { totalPages } = await listPublishedPostsPaginated(undefined, 1, POSTS_PER_PAGE)
    for (let p = 2; p <= totalPages; p++) {
      listingRoutes.push({
        url: `${base}/blog?page=${p}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.5,
      })
    }

    // Category pages (and their extra pages)
    const cats = await d1Query("SELECT slug FROM blog_categories ORDER BY sort_order")
    for (const c of (cats.results ?? []) as any[]) {
      const { totalCount, totalPages: catPages } = await listPublishedPostsPaginated(c.slug, 1, POSTS_PER_PAGE)
      if (totalCount === 0) continue
      listingRoutes.push({
        url: `${base}/blog?category=${c.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      })
      for (let p = 2; p <= catPages; p++) {
        listingRoutes.push({
          url: `${base}/blog?category=${c.slug}&page=${p}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.4,
        })
      }
    }

    const posts = await listPublishedPosts()
    for (const p of posts.slice(0, 5000)) {
      postRoutes.push({
        url: `${base}/blog/${p.slug}`,
        lastModified: new Date(p.publishedAt ?? now),
        changeFrequency: "monthly",
        priority: 0.6,
      })
    }
  } catch {
    return staticRoutes
  }

  return [...staticRoutes, ...listingRoutes, ...postRoutes]
}
