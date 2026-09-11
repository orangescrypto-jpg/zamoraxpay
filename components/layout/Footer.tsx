// components/layout/Footer.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import type { Banner } from "@/src/types"

const FOOTER_AUTO_SLIDE_INTERVAL_MS = 5000

function FooterBanner() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    fetch("/api/banners?placement=footer")
      .then((res) => res.json())
      .then((data) => setBanners(data.banners ?? []))
      .catch(() => setBanners([]))
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (banners.length === 0) return
      setActiveIndex(((index % banners.length) + banners.length) % banners.length)
    },
    [banners.length],
  )

  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => goTo(activeIndex + 1), FOOTER_AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, banners.length, goTo])

  if (banners.length === 0) return null

  const banner = banners[activeIndex]

  const content = (
    <div className="relative overflow-hidden rounded-lg">
      <img
        key={banner.id}
        src={banner.imageUrl}
        alt={banner.title ?? "Promotion"}
        className="h-24 w-full object-cover sm:h-32"
      />
      {banner.title && (
        <div className="absolute inset-0 flex items-center bg-black/30 px-4">
          <p className="text-sm font-medium text-white sm:text-base">{banner.title}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative mb-8">
      {banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous promotion"
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ›
          </button>
          <div className="mt-2 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                type="button"
                key={b.id}
                aria-label={`Go to promotion ${i + 1}`}
                onClick={() => goTo(i)}
                className={
                  i === activeIndex
                    ? "h-1.5 w-5 rounded-full bg-white transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-white/30 transition-all"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
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
