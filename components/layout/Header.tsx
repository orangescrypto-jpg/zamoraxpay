// components/layout/Header.tsx
"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import type { Banner } from "@/src/types"
import { getPublicBanners } from "./bannerClient"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { ThemeToggle } from "@/components/theme-toggle"

const AUTO_SLIDE_INTERVAL_MS = 5000

// The featured blog categories shown in the Blog nav dropdown, in
// display order. Kept in sync with the sort_order set in
// migrations/2026-09-add-tech-news-category.sql. This is a small,
// stable set curated for navigation - it intentionally doesn't
// include every row in blog_categories (e.g. reseller-tips), and
// doesn't need a DB round-trip just to render the header.
const BLOG_NAV_CATEGORIES = [
  { slug: "tech-news", label: "Tech News" },
  { slug: "guides", label: "Guides" },
  { slug: "network-news", label: "Network News" },
  { slug: "promotions", label: "Promotions" },
  { slug: "announcements", label: "Announcements" },
  { slug: "jobs", label: "Jobs" },
  { slug: "scholarships", label: "Scholarships" },
  { slug: "grants", label: "Grants" },
  { slug: "internships", label: "Internships" },
]

function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    getPublicBanners()
      .then((items) => setBanners(items.filter((item) => item.placement === "header_slider")))
      .catch(() => setBanners([]))
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (banners.length === 0) return
      setActiveIndex(((index % banners.length) + banners.length) % banners.length)
    },
    [banners.length],
  )

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => { if (document.visibilityState === "visible") goTo(activeIndex + 1) }, AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, banners.length, goTo])

  if (banners.length === 0) return null

  const current = banners[activeIndex]

  const SlideContent = (
    <div className="relative w-full overflow-hidden rounded-lg bg-secondary">
      <img
        key={current.id}
        src={current.imageUrl}
        alt={current.title ?? "Promotional banner"}
        className="banner-slide-enter block h-auto w-full"
      />
      {current.title && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-sm font-medium text-white sm:text-base">{current.title}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative">
      {current.linkUrl ? <Link href={current.linkUrl}>{SlideContent}</Link> : SlideContent}

      {/* Manual controls */}
      {banners.length > 1 && (
        <>
          <button
            aria-label="Previous banner"
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            aria-label="Next banner"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ›
          </button>
          <div className="mt-2 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Go to banner ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Header() {
  const { user, isAuthenticated, signOut, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [blogMenuOpen, setBlogMenuOpen] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(true)
  const isAdmin = !!user?.adminRole

  // Header banner slider: logged-out visitors see it on every page.
  // Logged-in users only see it on the public blog. Admin routes are
  // hard-excluded regardless of auth state, so there's no flash of the
  // banner while auth is still resolving on first paint.
  const isAdminPage = pathname === "/admin" || pathname?.startsWith("/admin/")
  const isBlogPage = pathname === "/blog" || pathname?.startsWith("/blog/")
  const showHeaderBanner = isAdminPage ? false : loading ? false : isAuthenticated ? isBlogPage : true

  // Scrolling down hides the banner strip immediately (nav bar itself
  // stays put). It only reappears once the page is scrolled all the
  // way back to the top.
  useEffect(() => {
    if (!showHeaderBanner) return

    const handleScroll = () => {
      setBannerVisible(window.scrollY <= 0)
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [showHeaderBanner])

  // Full sign-out: clear the session, then hard-navigate home so no
  // stale client-side router cache or component state can show the
  // dashboard again after logout.
  const handleSignOut = async () => {
    await signOut()
    window.location.href = "/"
  }

  const touchStartX = useRef<number | null>(null)

  // Let floating buttons (WhatsApp, tools) know the mobile menu is open
  // so they can hide and stop covering Settings / Sign out.
  useEffect(() => {
    if (menuOpen) {
      document.body.dataset.mobileMenu = "open"
      document.body.style.overflow = "hidden"
    } else {
      delete document.body.dataset.mobileMenu
      document.body.style.overflow = ""
    }
    return () => {
      delete document.body.dataset.mobileMenu
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  return (
    <header className="relative sticky top-0 z-[70] border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between">
        {/* Always link to "/" here - middleware already redirects logged-in
            visitors from "/" to "/dashboard" server-side, so this never
            depends on (potentially stale) client auth state. */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-heading font-bold text-primary">Zamorax</span>
          <span className="text-xl font-heading font-bold text-secondary">Pay</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {isAuthenticated && (
            <Link href="/dashboard" className="text-sm font-medium text-secondary hover:text-primary">
              Dashboard
            </Link>
          )}
          {/* Blog nav dropdown: keyboard-accessible.
              Previously hover-only (onMouseEnter/Leave), which made it
              unusable for keyboard + screen-reader users. Now opens on
              click, focus, and hover, and closes on Escape / blur. */}
          <div
            className="relative"
            onMouseEnter={() => setBlogMenuOpen(true)}
            onMouseLeave={() => setBlogMenuOpen(false)}
            onFocus={() => setBlogMenuOpen(true)}
            onBlur={(e) => {
              // Only close when focus leaves the entire dropdown container.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setBlogMenuOpen(false)
            }}
          >
            <button
              type="button"
              onClick={() => setBlogMenuOpen((v) => !v)}
              aria-expanded={blogMenuOpen}
              aria-haspopup="true"
              className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
              Blog
              <svg
                className={cn("h-3.5 w-3.5 transition-transform", blogMenuOpen && "rotate-180")}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {blogMenuOpen && (
              <div
                className="absolute left-0 top-full z-50 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
                onKeyDown={(e) => { if (e.key === "Escape") setBlogMenuOpen(false) }}
              >
                <Link
                  href="/blog"
                  className="block px-4 py-2 text-sm font-medium text-secondary hover:bg-muted hover:text-primary"
                  onClick={() => setBlogMenuOpen(false)}
                >
                  All Posts
                </Link>
                <div className="my-1 border-t border-border" />
                {BLOG_NAV_CATEGORIES.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/blog?category=${c.slug}`}
                    className="block px-4 py-2 text-sm text-secondary hover:bg-muted hover:text-primary"
                    onClick={() => setBlogMenuOpen(false)}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/reseller" prefetch={false} className="text-sm font-medium text-secondary hover:text-primary">
            Become a Reseller
          </Link>
          <Link href="/help" className="text-sm font-medium text-secondary hover:text-primary">
            Help
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-sm font-medium text-secondary hover:text-primary">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <CommandPalette />
          {isAuthenticated ? (
            <>
              <Link href="/wallet" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Wallet
              </Link>
              <Link href="/rewards" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Rewards
              </Link>
              <Link href="/refund" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Refund
              </Link>
              <Link href="/settings" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="hidden rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted sm:block"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Log in
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 sm:block"
              >
                Sign up
              </Link>
            </>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border md:hidden"
          >
            <span className="flex flex-col gap-1">
              <span className={cn("block h-0.5 w-5 bg-secondary transition-transform dark:bg-foreground", menuOpen && "translate-y-1.5 rotate-45")} />
              <span className={cn("block h-0.5 w-5 bg-secondary transition-opacity dark:bg-foreground", menuOpen && "opacity-0")} />
              <span className={cn("block h-0.5 w-5 bg-secondary transition-transform dark:bg-foreground", menuOpen && "-translate-y-1.5 -rotate-45")} />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          aria-label="Mobile menu"
          className="absolute inset-x-0 top-full z-50 flex max-h-[min(85dvh,calc(100dvh-4rem))] flex-col border-t border-border bg-card shadow-lg md:hidden"
          onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null }}
          onTouchEnd={(e) => {
            const start = touchStartX.current
            touchStartX.current = null
            if (start == null) return
            const end = e.changedTouches[0]?.clientX
            if (end != null && start - end > 80) setMenuOpen(false) // swipe left to close
          }}
        >
          <div className="container flex-1 overflow-y-auto overscroll-contain py-3 pb-4">
            {isAuthenticated && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/wallet"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Wallet
            </Link>
            <Link
              href="/rewards"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Rewards
            </Link>
            <Link
              href="/refund"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Refund
            </Link>
            <Link
              href="/blog"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Blog
            </Link>
            <Link
              href="/help"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Help Center
            </Link>
            <div className="flex flex-col pl-3">
              {BLOG_NAV_CATEGORIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/blog?category=${c.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-primary"
                >
                  {c.label}
                </Link>
              ))}
            </div>
            <Link
              href="/reseller"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Become a Reseller
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
            >
              Settings
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
              >
                Admin
              </Link>
            )}
          </div>

          {/* Sticky footer: Sign out / auth always visible above FABs & bottom nav */}
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.12)]">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  handleSignOut()
                }}
                className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-secondary transition hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 dark:text-foreground"
              >
                Sign out
              </button>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-3 text-center text-sm font-semibold text-secondary hover:bg-muted dark:text-foreground"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}

      {showHeaderBanner && (
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
            bannerVisible ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="container pb-3 pt-3">
            <BannerSlider />
          </div>
        </div>
      )}
    </header>
  )
}
