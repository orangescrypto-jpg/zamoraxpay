// app/sitemap.ts
import type { MetadataRoute } from "next"
import { listPublishedPosts } from "@/src/services/blog"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/services/airtime`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/services/data`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/services/cable`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/services/electricity`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/services/exam-pin`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/services/betting`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/reseller`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cookie-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ]

  try {
    const posts = await listPublishedPosts()
    const postRoutes: MetadataRoute.Sitemap = posts.slice(0, 5000).map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt ?? now),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
    return [...staticRoutes, ...postRoutes]
  } catch {
    return staticRoutes
  }
}
