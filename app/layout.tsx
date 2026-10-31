
// app/layout.tsx
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { SiteChrome } from "@/components/layout/SiteChrome"
import { AdSenseLoader } from "@/components/shared/AdSenseLoader"

// IMPORTANT: previously this whole layout was `force-dynamic`, which
// rendered every single page per-request and killed static optimisation
// on 2G/3G networks. DB-backed pages opt into `force-dynamic` /
// `revalidate` per-route (see app/page.tsx, app/(public)/blog/page.tsx,
// etc.). The root layout itself stays static so the chrome (Header,
// Footer, theme script, fonts) can be cached on the CDN edge.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: false,
})
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  adjustFontFallback: false,
})

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "ZamoraxPay - Airtime, Data, Bills & More",
    template: "%s - ZamoraxPay",
  },
  description:
    "Buy airtime, data, cable TV, electricity, and exam PINs, all from one fast, reliable wallet. Built for reliability on Nigerian networks.",
  manifest: "/manifest.json",
  // themeColor is now exported from `viewport` (Next.js 14+ requirement).
  // See viewport export at the bottom of this file.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  openGraph: {
    title: "ZamoraxPay - Airtime, Data, Bills & More",
    description:
      "Buy airtime, data, cable TV, electricity, and exam PINs, all from one fast, reliable wallet.",
    url: BASE_URL,
    siteName: "ZamoraxPay",
    locale: "en_NG",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "ZamoraxPay logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZamoraxPay - Airtime, Data, Bills & More",
    description:
      "Buy airtime, data, cable TV, electricity, and exam PINs, all from one fast, reliable wallet.",
    images: ["/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZamoraxPay",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  keywords: [
    "airtime", "data", "VTU", "bills payment", "cable TV", "DSTV", "GOtv", "StarTimes",
    "electricity", "WAEC", "NECO", "JAMB", "exam PIN", "Nigeria", "wallet",
    "ZamoraxPay", "airtime to cash",
  ],
  authors: [{ name: "ZamoraxPay" }],
  creator: "ZamoraxPay",
  publisher: "ZamoraxPay",
  alternates: { canonical: "/" },
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ZamoraxPay",
  url: "https://zamoraxpay.com.ng",
  logo: "https://zamoraxpay.com.ng/icon-512.png",
  description: "VTU and bills-payment platform for airtime, data, cable TV, electricity, and exam PINs in Nigeria.",
  sameAs: ["https://facebook.com/zamoraxpay", "https://twitter.com/zamoraxpay"],
  contactPoint: [{
    "@type": "ContactPoint",
    contactType: "customer support",
    availableLanguage: ["English"],
  }],
}

// WebSite schema with SearchAction enables Google sitelinks search box.
// Points at /blog?q=... which is the only in-app search surface today.
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ZamoraxPay",
  url: "https://zamoraxpay.com.ng",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://zamoraxpay.com.ng/blog?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <AdSenseLoader />
        {/* Performance hints: preconnect to the origins we hit on first paint.
            Saves ~150-250ms of TLS round-trips on the very first navigation. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://zamorax.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://zamorax.com" />
        {/* Helpful for older browsers / Slack / Telegram / Outlook link previews */}
        <meta name="application-name" content="ZamoraxPay" />
        <meta name="format-detection" content="telephone=no" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("zamoraxpay-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=t==="dark"||(t!=="light"&&d)?"dark":"light";document.documentElement.classList.add(r);document.documentElement.setAttribute("data-theme",r)}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-body`}>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  )
}
