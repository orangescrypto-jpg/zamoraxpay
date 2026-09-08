/** @type {import('next').NextConfig} */
// ZamoraxPay — VTU & Utility Bills Hub
// Auth: Supabase (own project, separate from Zamorax Marketplace)
// DB: Cloudflare D1 (own database, separate from Zamorax Marketplace)
//
// IMPORTANT: This config is intentionally host-agnostic. No Vercel-only
// runtime features are used anywhere in the app, so it can be deployed to
// Vercel, Cloudflare Pages/Workers, or any Node-compatible host unchanged.

const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_R2_HOSTNAME
        ? [{ protocol: "https", hostname: process.env.NEXT_PUBLIC_R2_HOSTNAME }]
        : []),
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },

  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
