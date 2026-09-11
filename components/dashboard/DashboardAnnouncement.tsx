// components/dashboard/DashboardAnnouncement.tsx
// Compact announcement slider shown on the dashboard only, between
// the wallet balance card and Quick actions. Same auto+manual slide
// mechanics as the header BannerSlider, but sized as a short
// rectangle strip instead of a tall hero slide. Admin can set text,
// an image, or both per slide — the link is optional per slide, so
// this doubles as a plain announcement when there's nothing to click
// through to.
"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"

const AUTO_SLIDE_INTERVAL_MS = 5000

interface Announcement {
  id: string
  text: string | null
  imageUrl: string | null
  linkUrl: string | null
}

export function DashboardAnnouncement() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch("/api/dashboard-announcement", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (!cancelled) setAnnouncements(data.announcements ?? [])
      } catch {
        if (!cancelled) setAnnouncements([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (announcements.length === 0) return
      setActiveIndex(((index % announcements.length) + announcements.length) % announcements.length)
    },
    [announcements.length],
  )

  // Auto-slide
  useEffect(() => {
    if (announcements.length <= 1) return
    const timer = setInterval(() => goTo(activeIndex + 1), AUTO_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [activeIndex, announcements.length, goTo])

  if (loading || announcements.length === 0) return null

  const current = announcements[activeIndex]
  if (!current.text && !current.imageUrl) return null

  // Compact rectangle — fixed short height so it sits as a slim strip
  // between the wallet card and Quick actions, similar to a YouTube
  // mobile promo card: image (if any) on the left, text filling the
  // rest, whole thing tappable only if a link is set.
  const slide = (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-white px-3 py-2.5 shadow-[0_2px_10px_-6px_rgba(15,30,77,0.15)] transition hover:border-blue-200">
      {current.imageUrl && (
        <img
          key={current.id}
          src={current.imageUrl}
          alt={current.text ?? "Announcement"}
          className="h-11 w-11 shrink-0 rounded-xl object-cover sm:h-12 sm:w-12"
        />
      )}
      {current.text && (
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-secondary sm:text-sm">
          {current.text}
        </p>
      )}
    </div>
  )

  return (
    <div className="relative mt-4">
      {current.linkUrl ? (
        <Link href={current.linkUrl} className="block">
          {slide}
        </Link>
      ) : (
        slide
      )}

      {/* Manual controls */}
      {announcements.length > 1 && (
        <>
          <button
            aria-label="Previous announcement"
            onClick={() => goTo(activeIndex - 1)}
            className="absolute left-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-[10px] text-white hover:bg-black/50"
          >
            ‹
          </button>
          <button
            aria-label="Next announcement"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-[10px] text-white hover:bg-black/50"
          >
            ›
          </button>
          <div className="mt-1.5 flex justify-center gap-1">
            {announcements.map((a, i) => (
              <button
                key={a.id}
                aria-label={`Go to announcement ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1 rounded-full transition-all",
                  i === activeIndex ? "w-4 bg-primary" : "w-1 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
