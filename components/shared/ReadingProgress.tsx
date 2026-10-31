// components/shared/ReadingProgress.tsx
// Fixed-position top progress bar that fills as the reader scrolls
// through the article. Respects prefers-reduced-motion (CSS class
// is already handled globally in globals.css via html.zpx-reduce-motion).
// Uses requestAnimationFrame + passive scroll listener, so it has no
// measurable impact on scroll jank.

"use client"

import { useEffect, useState } from "react"

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handler = () => {
      const doc = document.documentElement
      const scrollTop = window.scrollY || doc.scrollTop
      const height = doc.scrollHeight - doc.clientHeight
      if (height <= 0) {
        setProgress(0)
        return
      }
      const pct = Math.min(100, Math.max(0, (scrollTop / height) * 100))
      setProgress(pct)
    }

    handler()
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handler()
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div
      className="zpx-reading-progress"
      style={{ width: `${progress}%` }}
      aria-hidden="true"
    />
  )
}
