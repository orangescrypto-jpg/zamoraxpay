// components/layout/Header.tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
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
    <div className="relative h-32 w-full overflow-hidden rounded-lg bg-secondary sm:h-40 md:h-48">
      <img
        key={current.id}
        src={current.imageUrl}
        alt={current.title ?? "Promotional banner"}
        className="banner-slide-enter h-full w-full object-cover"
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
  const { user, isAuthenticated, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isAdmin = !!user?.adminRole

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="container flex h-16 items-center justify-between">
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2">
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
          <Link href="/reseller" className="text-sm font-medium text-secondary hover:text-primary">
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
              <Link href="/referrals" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Refer & Earn
              </Link>
              <Link href="/settings" className="hidden text-sm font-medium text-secondary hover:text-primary sm:block">
                Settings
              </Link>
              <button
                onClick={() => signOut()}
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
              href="/referrals"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary hover:bg-muted"
            >
              Refer & Earn
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
                    signOut()
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

      <div className="container pb-3">
        <BannerSlider />
      </div>
    </header>
  )
}
