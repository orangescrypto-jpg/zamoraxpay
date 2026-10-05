// components/shared/TableOfContents.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import type { TocHeading } from "@/lib/simpleMarkdown"

export function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const clickedRef = useRef(false)

  // Highlight whichever heading is currently nearest the top of the
  // viewport as the user scrolls through the post.
  useEffect(() => {
    if (headings.length === 0) return

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // A manual click already set the active id — don't let the
        // observer fight it while the smooth-scroll is still in flight.
        if (clickedRef.current) return

        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  function handleClick(id: string) {
    clickedRef.current = true
    setActiveId(id)
    setOpen(false)
    window.setTimeout(() => {
      clickedRef.current = false
    }, 1000)
  }

  return (
    <nav aria-label="Table of contents" className="mb-8 rounded-xl border border-border bg-muted/40 p-4 lg:sticky lg:top-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-secondary lg:pointer-events-none lg:cursor-default"
      >
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          On this page
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`transition-transform lg:hidden ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul className={`mt-3 space-y-1.5 text-sm ${open ? "block" : "hidden"} lg:block`}>
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${heading.id}`}
              onClick={() => handleClick(heading.id)}
              className={`block border-l-2 py-0.5 pl-3 transition-colors ${
                activeId === heading.id
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-secondary"
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
