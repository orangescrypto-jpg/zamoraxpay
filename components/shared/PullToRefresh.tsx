"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Lightweight pull-to-refresh for mobile. Calls onRefresh when pulled past threshold. */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => void | Promise<void>
  children: React.ReactNode
  className?: string
}) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 2) return
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && window.scrollY <= 0) setPull(Math.min(dy, 100))
  }, [refreshing])

  const onTouchEnd = useCallback(async () => {
    if (pull > 60 && !refreshing) {
      setRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
      }
    }
    startY.current = null
    setPull(0)
  }, [pull, refreshing, onRefresh])

  return (
    <div
      className={cn("relative", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="pointer-events-none flex items-center justify-center text-xs font-medium text-muted-foreground transition-all"
        style={{ height: pull || (refreshing ? 36 : 0), opacity: pull > 20 || refreshing ? 1 : 0 }}
        aria-live="polite"
      >
        {refreshing ? "Refreshing…" : pull > 60 ? "Release to refresh" : "Pull to refresh"}
      </div>
      {children}
    </div>
  )
}
