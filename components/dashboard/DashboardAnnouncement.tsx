// components/dashboard/DashboardAnnouncement.tsx
// Announcement slider shown on the dashboard only, between the
// wallet balance card and Quick actions. Same auto+manual slide
// mechanics as the header BannerSlider, and now sized as a proper
// wide banner strip (not a thumbnail) so a full 1200x400 image
// displays correctly instead of being cropped into a small square.
// Admin can set text, an image, or both per slide — the link is
// optional per slide, so this doubles as a plain announcement when
// there's nothing to click through to.
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

  // Wide banner strip — same aspect family as the header slider (just
  // shorter), so a 1200x400 upload renders full-bleed instead of
  // being cropped into a thumbnail. Text (if set) overlays the bottom
  // as a gradient caption, same treatment as the header BannerSlider,
  // so admins can use image-only, text-only, or both.
  const slide = (
    <div className="relative aspect-[3/1] w-full overflow-hidden rounded-2xl bg-secondary shadow-[0_2px_10px_-6px_rgba(15,30,77,0.15)]">
      {current.imageUrl ? (
        <img
          key={current.id}
          src={current.imageUrl}
          alt={current.text ?? "Announcement"}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center bg-[#0F1E4D] px-4">
          <p className="text-sm font-medium leading-snug text-white sm:text-base">{current.text}</p>
        </div>
      )}
      {current.imageUrl && current.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
          <p className="truncate text-[13px] font-medium leading-snug text-white sm:text-sm">{current.text}</p>
        </div>
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
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ‹
          </button>
          <button
            aria-label="Next announcement"
            onClick={() => goTo(activeIndex + 1)}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            ›
          </button>
          <div className="mt-2 flex justify-center gap-1.5">
            {announcements.map((a, i) => (
              <button
                key={a.id}
                aria-label={`Go to announcement ${i + 1}`}
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
