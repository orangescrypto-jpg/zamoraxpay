// components/layout/Footer.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import type { Banner } from "@/src/types"
import { getPublicBanners } from "./bannerClient"
import { AdSenseSlot } from "@/components/shared/AdSenseSlot"
import { isPrivatePath } from "@/lib/privateRoutes"

const FOOTER_AUTO_SLIDE_INTERVAL_MS = 5000

function FooterBanner() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    getPublicBanners()
      .then((items) => setBanners(items.filter((item) => item.placement === "footer")))
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
    const timer = setInterval(() => { if (document.visibilityState === "visible") goTo(activeIndex + 1) }, FOOTER_AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, banners.length, goTo])

  if (banners.length === 0) return null

  const banner = banners[activeIndex]

  const content = (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm">
      <img
        key={banner.id}
        src={banner.imageUrl}
        alt={banner.title ?? "Promotion"}
        className="block h-auto max-h-56 w-full object-cover sm:max-h-72" loading="lazy"
      />
      {banner.title && (
        <div className="absolute inset-0 flex items-center bg-black/30 px-4">
          <p className="text-sm font-medium text-white sm:text-base">{banner.title}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative mb-10" aria-label="Footer promotions">
      {banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous promotion"
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ›
          </button>
          <div className="mt-3 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                type="button"
                key={b.id}
                aria-label={`Go to promotion ${i + 1}`}
                onClick={() => goTo(i)}
                className={
                  i === activeIndex
                    ? "h-2.5 w-6 rounded-full bg-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    : "h-2.5 w-2.5 rounded-full bg-white/40 transition-all hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Same route list AdSenseLoader uses to decide "is this a logged-in
// app screen" - the footer is rendered site-wide from the root layout,
// so it needs its own check to keep the ad out of the dashboard/admin
// even though the Footer component itself doesn't know about auth.
export function Footer() {
  const pathname = usePathname()
  const marketplaceUrl = "https://zamorax.com"
  // isPrivatePath is the same list middleware.ts uses to gate auth -
  // one source of truth, so a newly protected route can't slip
  // through and show ads next to real account data.
  const showAd = !isPrivatePath(pathname)

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-secondary text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="container relative py-10 sm:py-14 lg:py-16">
        <FooterBanner />

        {/* About + contact block: real, crawlable business information on every public page */}
        <div className="mb-10 grid gap-6 border-b border-white/10 pb-8 sm:gap-8 sm:pb-10 md:grid-cols-3">
          <div className="md:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white">
              <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />
              About ZamoraxPay
            </h3>
            <p className="text-sm leading-relaxed text-white/65">
              ZamoraxPay is a Nigerian payments platform that lets you buy airtime, data, cable TV
              subscriptions, electricity tokens and exam PINs from one wallet. Every order is routed through
              several independent service providers, so if one is slow or down, your purchase moves to the
              next automatically. If it still fails, the money goes straight back to your wallet.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Fund your wallet securely with Korapay, track every transaction in your history, and earn
              cashback, referral bonuses and daily rewards as you go. We built ZamoraxPay so that paying for
              everyday things online feels simple, fair and dependable.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white">
              <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
              Contact Us
            </h3>
            <address className="space-y-2.5 text-sm not-italic text-white/65">
              <p className="font-medium text-white/85">Zamorax Enterprises Limited</p>
              <p>Apete, Ibadan, Oyo State, Nigeria</p>
              <p>
                <a href="mailto:zamoraxpay@gmail.com" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">zamoraxpay@gmail.com</a>
              </p>
              <p>
                <a href="tel:+2347076479357" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">+234 707 647 9357</a>
              </p>
              <p className="pt-1 text-xs text-white/40">Mon to Sat, 8:00 AM to 8:00 PM</p>
            </address>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-8 min-[420px]:grid-cols-2 sm:grid-cols-4 sm:gap-y-10">
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/90">ZamoraxPay</h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/about" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">About</Link></li>
              <li><Link href="/blog" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Blog</Link></li>
              <li><Link href="/contact" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/90">Services</h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/services/airtime" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Airtime</Link></li>
              <li><Link href="/services/data" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Data</Link></li>
              <li><Link href="/services/cable" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Cable TV</Link></li>
              <li><Link href="/services/electricity" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Electricity</Link></li>
              <li><Link href="/services/exam-pin" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Exam Pins</Link></li>
              <li><Link href="/rewards" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Rewards</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/90">Legal</h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/privacy-policy" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Privacy Policy</Link></li>
              <li><Link href="/terms" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Terms &amp; Conditions</Link></li>
              <li><Link href="/cookie-policy" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Cookie Policy</Link></li>
              <li><Link href="/refund-policy" className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">Refund Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/90">Part of Zamorax</h3>
            <p className="text-sm leading-relaxed text-white/65">
              Looking for higher-value peer-to-peer deals?{" "}
              <a href={marketplaceUrl} className="font-medium text-accent transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
                Visit Zamorax Marketplace
              </a>
            </p>
          </div>
        </div>

        {showAd && <AdSenseSlot slotKey="homepage_footer" className="mt-10" />}

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-white/40">
          <p>ZamoraxPay by Zamorax Enterprises Limited. RC9678731. Apete, Ibadan, Oyo State, Nigeria.</p>
          <p>© {new Date().getFullYear()} ZamoraxPay. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
