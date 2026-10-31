import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/blog",
          "/blog/*",
          "/about",
          "/contact",
          "/help",
          "/privacy-policy",
          "/terms",
          "/cookie-policy",
          "/refund-policy",
          "/services/",          // public marketing pages, must be indexed
          "/services/*",
          "/sitemap.xml",
          "/robots.txt",
          "/manifest.json",
        ],
        disallow: [
          "/dashboard/",
          "/dashboard/*",
          "/admin/",
          "/admin/*",
          "/wallet/",
          "/api/",
          "/settings/",
          "/history/",
          "/beneficiaries/",
          "/reseller/",
          "/rewards/",
          "/spin/",
          "/play/",
          "/cashback/",
          "/daily-streak/",
          "/refund/",
          "/login",
          "/signup",
          "/blog/*/preview",     // any future preview/draft URLs
          "*?q=*",               // do not index in-app search query URLs
          "*?sort=*",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
