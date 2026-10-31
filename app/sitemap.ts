// app/sitemap.ts
import type { MetadataRoute } from "next"
import { listPublishedPosts, listPublishedPostsPaginated } from "@/src/services/blog"
import { d1Query } from "@/lib/db"

const POSTS_PER_PAGE = 30

function absoluteUrl(base: string, path: string): string {
  if (path?.startsWith("http")) return path
  return `${base}${path?.startsWith("/") ? "" : "/"}${path ?? ""}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookie-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...[
      "airtime",
      "data",
      "cable",
      "electricity",
      "exam-pin",
      "airtime-to-cash",
      "epin",
      "bulk-airtime",
      "bulk-data",
      "international-topup",
    ].map((slug) => ({
      url: `${base}/services/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
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
        priority: 0.6,
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

    // Individual post URLs with image sitemap entries.
    const posts = await listPublishedPosts()
    for (const p of posts.slice(0, 5000)) {
      const lastModified = new Date(p.publishedAt ?? now)
      const image = p.coverImageUrl ? absoluteUrl(base, p.coverImageUrl) : undefined
      postRoutes.push({
        url: `${base}/blog/${p.slug}`,
        lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
        // @ts-expect-error - Next.js MetadataRoute.Sitemap accepts an `images` field
        // but its TS type definition is incomplete in this version.
        images: image ? [{ loc: image, title: p.title }] : undefined,
      })
    }
  } catch {
    return staticRoutes
  }

  return [...staticRoutes, ...listingRoutes, ...postRoutes]
}
