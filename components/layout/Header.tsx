// components/layout/Header.tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import type { Banner } from "@/src/types"

const AUTO_SLIDE_INTERVAL_MS = 5000

function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    fetch("/api/banners?placement=header_slider")
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

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => goTo(activeIndex + 1), AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, banners.length, goTo])

  if (banners.length === 0) return null

  const current = banners[activeIndex]

  const SlideContent = (
    <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg bg-secondary">
      <img
        key={current.id}
        src={current.imageUrl}
        alt={current.title ?? "Promotional banner"}
        className="banner-slide-enter h-full w-full object-contain"
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
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            aria-label="Next banner"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
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
  const [bannerVisible, setBannerVisible] = useState(true)
  const isAdmin = !!user?.adminRole

  // Header banner slider: only on the blog, and only for logged-out
  // visitors elsewhere. Never show it on the dashboard / other
  // authenticated pages. (Footer banners are unaffected.)
  const isBlogPage = pathname?.startsWith("/blog")
  const showHeaderBanner = isBlogPage || (!loading && !isAuthenticated)

  // Scrolling down hides the banner strip immediately (nav bar itself
  // stays put). Scrolling back up brings it back, but only after a
  // short delay so quick jitters don't flicker it back on.
  useEffect(() => {
    if (!showHeaderBanner) return
    let lastY = window.scrollY
    let upwardAccum = 0
    let showTimer: ReturnType<typeof setTimeout> | null = null
    const SHOW_DELAY_MS = 350
    const SHOW_DISTANCE_PX = 40

    const clearShowTimer = () => {
      if (showTimer) {
        clearTimeout(showTimer)
        showTimer = null
      }
    }

    const handleScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - lastY

      if (currentY <= 0) {
        upwardAccum = 0
        clearShowTimer()
        setBannerVisible(true)
      } else if (delta > 0) {
        // Scrolling down: hide right away.
        upwardAccum = 0
        clearShowTimer()
        setBannerVisible(false)
      } else if (delta < 0) {
        // Scrolling up: only show again after sustained upward scroll.
        upwardAccum += -delta
        if (upwardAccum > SHOW_DISTANCE_PX && !showTimer) {
          showTimer = setTimeout(() => setBannerVisible(true), SHOW_DELAY_MS)
        }
      }

      lastY = currentY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      clearShowTimer()
    }
  }, [showHeaderBanner])

  // Full sign-out: clear the session, then hard-navigate home so no
  // stale client-side router cache or component state can show the
  // dashboard again after logout.
  const handleSignOut = async () => {
    await signOut()
    window.location.href = "/"
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="container flex h-16 items-center justify-between">
        {/* Always link to "/" here — middleware already redirects logged-in
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
          <Link href="/blog" className="text-sm font-medium text-secondary hover:text-primary">
            Blog
          </Link>
          <Link href="/reseller" prefetch={false} className="text-sm font-medium text-secondary hover:text-primary">
            Become a Reseller
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-sm font-medium text-secondary hover:text-primary">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
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
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border md:hidden"
          >
            <span className="flex flex-col gap-1">
              <span className={cn("block h-0.5 w-5 bg-secondary transition-transform", menuOpen && "translate-y-1.5 rotate-45")} />
              <span className={cn("block h-0.5 w-5 bg-secondary transition-opacity", menuOpen && "opacity-0")} />
              <span className={cn("block h-0.5 w-5 bg-secondary transition-transform", menuOpen && "-translate-y-1.5 -rotate-45")} />
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-border bg-white md:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {isAuthenticated && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
              >
                Dashboard
              </Link>
            )}
            <Link
              href="/wallet"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Wallet
            </Link>
            <Link
              href="/rewards"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Rewards
            </Link>
            <Link
              href="/refund"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Refund
            </Link>
            <Link
              href="/blog"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Blog
            </Link>
            <Link
              href="/reseller"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Become a Reseller
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Settings
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
              >
                Admin
              </Link>
            )}

            <div className="mt-2 border-t border-border pt-2">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleSignOut()
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-secondary hover:bg-muted"
                >
                  Sign out
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </nav>
      )}

      {showHeaderBanner && (
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
            bannerVisible ? "max-h-[220px] opacity-100" : "max-h-0 opacity-0",
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
