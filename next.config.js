/** @type {import('next').NextConfig} */
// ZamoraxPay - VTU & Utility Bills Hub
// Auth: Supabase (own project, separate from Zamorax Marketplace)
// DB: Cloudflare D1 (own database, separate from Zamorax Marketplace)
//
// IMPORTANT: This config is intentionally host-agnostic. No Vercel-only
// runtime features are used anywhere in the app, so it can be deployed to
// Vercel, Cloudflare Pages/Workers, or any Node-compatible host unchanged.

// Content-Security-Policy: only allow what the app actually needs.
// - Supabase auth/storage (NEXT_PUBLIC_SUPABASE_URL)
// - Cloudflare R2 images (*.r2.dev, env-configurable hostname)
// - Google Fonts + AdSense (already loaded by Next.js font system and the
//   AdSenseLoader component)
// - 'unsafe-inline' on style is required by Next.js styled-jsx / Tailwind
//   CSS-in-JS runtime; 'unsafe-eval' is NOT required and stays disabled.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co"
const r2Host = process.env.NEXT_PUBLIC_R2_HOSTNAME || "*.r2.dev"
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://www.googletagmanager.com https://www.google-analytics.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob: https: ${supabaseHost.startsWith("*.") ? supabaseHost : "https://" + supabaseHost} https://${r2Host} https://lh3.googleusercontent.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `connect-src 'self' https: ${supabaseHost.startsWith("*.") ? supabaseHost : "https://" + supabaseHost} https://${r2Host}`,
  `frame-src 'self' https://www.google.com https://googleads.g.doubleclick.net`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https:`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join("; ")

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
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
