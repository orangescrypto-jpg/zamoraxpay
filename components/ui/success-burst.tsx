"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/** Lightweight CSS confetti — no external deps. Honors reduced motion. */
export function SuccessBurst({ active, className }: { active: boolean; className?: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!active) return
    if (typeof document !== "undefined" && document.documentElement.classList.contains("zpx-reduce-motion")) return
    setShow(true)
    const t = window.setTimeout(() => setShow(false), 1200)
    return () => window.clearTimeout(t)
  }, [active])

  if (!show) return null
  const colors = ["#0057FF", "#00D67A", "#F59E0B", "#EF4444", "#8B5CF6"]
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="zpx-confetti-piece absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
          style={{
            background: colors[i % colors.length],
            // @ts-expect-error css vars
            "--dx": `${(i % 2 === 0 ? 1 : -1) * (20 + (i * 7) % 60)}px`,
            "--dy": `${-40 - (i * 11) % 80}px`,
            animationDelay: `${(i % 6) * 30}ms`,
          }}
        />
      ))}
    </div>
  )
}
