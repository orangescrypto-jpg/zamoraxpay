// app/layout.tsx
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner"
import PWARegistrar from "@/components/shared/PWARegistrar"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" })

export const metadata: Metadata = {
  title: "ZamoraxPay — Airtime, Data, Bills & More",
  description:
    "Buy airtime, data, cable TV, electricity, exam PINs, and fund your betting wallet — all from one fast, reliable wallet.",
  manifest: "/manifest.json",
  themeColor: "#0057FF",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "ZamoraxPay — Airtime, Data, Bills & More",
    description:
      "Buy airtime, data, cable TV, electricity, exam PINs, and fund your betting wallet — all from one fast, reliable wallet.",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "ZamoraxPay — Airtime, Data, Bills & More",
    images: ["/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZamoraxPay",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-body`}>
        <PWARegistrar />
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <CookieConsentBanner />
      </body>
    </html>
  )
}
