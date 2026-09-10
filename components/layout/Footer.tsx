// components/layout/Footer.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { Banner } from "@/src/types"

function FooterBanner() {
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    fetch("/api/banners?placement=footer")
      .then((res) => res.json())
      .then((data) => setBanner(data.banners?.[0] ?? null))
      .catch(() => setBanner(null))
  }, [])

  if (!banner) return null

  const content = (
    <div className="relative overflow-hidden rounded-lg">
      <img src={banner.imageUrl} alt={banner.title ?? "Promotion"} className="h-24 w-full object-cover sm:h-32" />
      {banner.title && (
        <div className="absolute inset-0 flex items-center bg-black/30 px-4">
          <p className="text-sm font-medium text-white sm:text-base">{banner.title}</p>
        </div>
      )}
    </div>
  )

  return <div className="mb-8">{banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}</div>
}

export function Footer() {
  const marketplaceUrl = "https://zamorax.com"

  return (
    <footer className="border-t border-border bg-secondary text-white">
      <div className="container py-10">
        <FooterBanner />

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">ZamoraxPay</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link href="/about" className="hover:text-white">About</Link></li>
              <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Services</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link href="/services/airtime" className="hover:text-white">Airtime</Link></li>
              <li><Link href="/services/data" className="hover:text-white">Data</Link></li>
              <li><Link href="/services/cable" className="hover:text-white">Cable TV</Link></li>
              <li><Link href="/services/electricity" className="hover:text-white">Electricity</Link></li>
              <li><Link href="/services/exam-pin" className="hover:text-white">Exam Pins</Link></li>
              <li><Link href="/rewards" className="hover:text-white">Rewards</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Legal</h3>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms &amp; Conditions</Link></li>
              <li><Link href="/cookie-policy" className="hover:text-white">Cookie Policy</Link></li>
              <li><Link href="/refund-policy" className="hover:text-white">Refund Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Part of Zamorax</h3>
            <p className="text-sm text-white/70">
              Looking for higher-value peer-to-peer deals?{" "}
              <a href={marketplaceUrl} className="text-accent hover:underline">
                Visit Zamorax Marketplace
              </a>
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <p>ZamoraxPay by Zamorax Enterprises Limited. RC9678731</p>
          <p>© {new Date().getFullYear()} ZamoraxPay. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
