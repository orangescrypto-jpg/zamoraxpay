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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") goTo(activeIndex + 1)
    }, FOOTER_AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, banners.length, goTo])

  if (banners.length === 0) return null

  const banner = banners[activeIndex]

  const content = (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-soft transition-transform duration-300 hover:scale-[1.01]">
      <img
        key={banner.id}
        src={banner.imageUrl}
        alt={banner.title ?? "Promotion"}
        className="block h-auto max-h-56 w-full object-cover sm:max-h-72"
        loading="lazy"
      />
      {banner.title && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5">
          <p className="text-sm font-semibold text-white sm:text-base">{banner.title}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative mb-12" aria-label="Footer promotions">
      {banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous promotion"
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-xl text-white shadow-md backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next promotion"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-xl text-white shadow-md backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ›
          </button>
          <div className="mt-4 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                type="button"
                key={b.id}
                aria-label={`Go to promotion ${i + 1}`}
                onClick={() => goTo(i)}
                className={
                  i === activeIndex
                    ? "h-2.5 w-7 rounded-full bg-card shadow transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    : "h-2.5 w-2.5 rounded-full bg-card/40 transition-all hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// A single always-visible banner slot, separate from the carousel
// above — rendered at the image's own natural width/height (no
// object-cover crop, no fixed max-height) so it can hold any banner
// dimensions the admin uploads. Only the most recent active one for
// this placement is shown (the API already orders by sort_order, so
// this takes the first result).
function StandaloneFooterBanner() {
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    getPublicBanners()
      .then((items) => {
        const match = items.find((item) => item.placement === "footer_standalone")
        setBanner(match ?? null)
      })
      .catch(() => setBanner(null))
  }, [])

  if (!banner) return null

  const content = (
    <img
      src={banner.imageUrl}
      alt={banner.title ?? "Promotion"}
      className="block h-auto w-full rounded-2xl"
      loading="lazy"
    />
  )

  return (
    <div className="relative mb-12" aria-label="Footer promotion">
      {banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}
      {banner.title && <p className="mt-2 text-center text-sm font-medium text-white/80">{banner.title}</p>}
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
    <footer className="relative overflow-hidden border-t border-border bg-secondary text-white">
      {/* Top accent line */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
      />
      {/* Soft background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="container relative py-12 sm:py-16 lg:py-20">
        <FooterBanner />
        <StandaloneFooterBanner />

        {/* Brand + Contact */}
        <div className="mb-12 grid gap-8 border-b border-white/10 pb-10 md:grid-cols-5 md:gap-10">
          <div className="md:col-span-3">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-heading font-bold text-primary-foreground">
                Z
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">ZamoraxPay</p>
                <p className="text-xs text-white/50">Fast, reliable, fair</p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-white/65">
              ZamoraxPay is a Nigerian payments platform that lets you buy airtime, data, cable TV
              subscriptions, electricity tokens and exam PINs from one wallet. Every order is routed
              through several independent providers. If one is slow or down, your purchase moves to
              the next automatically. If it still fails, the money goes straight back to your wallet.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">
              Fund securely, track every transaction, and earn cashback, referral bonuses and daily
              rewards. Paying for everyday things should feel simple and dependable.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm md:col-span-2">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white">
              <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />
              Contact Us
            </h3>
            <address className="space-y-3 text-sm not-italic text-white/70">
              <p className="font-medium text-white/90">Zamorax Enterprises Limited</p>
              <p>Apete, Ibadan, Oyo State, Nigeria</p>
              <p>
                <a
                  href="mailto:zamoraxpay@gmail.com"
                  className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <span aria-hidden>✉</span> zamoraxpay@gmail.com
                </a>
              </p>
              <p>
                <a
                  href="tel:+2347076479357"
                  className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <span aria-hidden>☎</span> +234 707 647 9357
                </a>
              </p>
              <p>
                <a
                  href="https://wa.me/2347076479357"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-sm font-medium text-primary transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <span aria-hidden>💬</span> Chat on WhatsApp
                </a>
              </p>
              <p className="pt-1 text-xs text-white/40">Monday to Saturday · 8:00 AM to 8:00 PM WAT</p>
            </address>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-x-12">
          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-white/90">
              Company
            </h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li>
                <Link
                  href="/about"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/rewards"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Rewards & Cashback
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-white/90">
              Services
            </h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li>
                <Link
                  href="/services/airtime"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Airtime
                </Link>
              </li>
              <li>
                <Link
                  href="/services/data"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Data Bundles
                </Link>
              </li>
              <li>
                <Link
                  href="/services/cable"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Cable TV
                </Link>
              </li>
              <li>
                <Link
                  href="/services/electricity"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Electricity
                </Link>
              </li>
              <li>
                <Link
                  href="/services/exam-pin"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Exam Pins
                </Link>
              </li>
              <li>
                <Link
                  href="/services/betting"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Betting Wallet
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-white/90">
              Legal
            </h3>
            <ul className="space-y-3 text-sm text-white/65">
              <li>
                <Link
                  href="/privacy-policy"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/cookie-policy"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/refund-policy"
                  className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-white/90">
              Part of Zamorax
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-white/65">
              Looking for higher-value peer-to-peer deals?
            </p>
            <a
              href={marketplaceUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Visit Zamorax Marketplace
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>

        {showAd && <AdSenseSlot slotKey="homepage_footer" className="mt-12" />}

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center sm:flex-row sm:text-left">
          <div className="text-xs leading-relaxed text-white/45">
            <p className="font-medium text-white/55">
              ZamoraxPay by Zamorax Enterprises Limited · RC9678731
            </p>
            <p className="mt-0.5">Apete, Ibadan, Oyo State, Nigeria</p>
          </div>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} ZamoraxPay. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
