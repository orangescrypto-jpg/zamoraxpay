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
          "/privacy-policy",
          "/terms",
          "/cookie-policy",
          "/refund-policy",
        ],
        disallow: ["/dashboard/", "/admin/", "/wallet/", "/api/", "/settings/", "/history/", "/beneficiaries/", "/services/", "/reseller/", "/rewards/", "/spin/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
