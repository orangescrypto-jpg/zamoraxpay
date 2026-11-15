"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Math.round((now - t) / 1000)
  if (diff < 45) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

export function RelativeTime({
  date,
  className,
}: {
  date: string
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // CPU FIX: keep the 60s tick but skip the setState while the tab is
    // hidden (a backgrounded dashboard used to re-render every minute
    // for no visible change) and realign to the minute boundary so the
    // label flips right after the actual minute rolls over.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now())
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now())
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
  const label = formatRelative(date, now)
  const full = new Date(date).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  return (
    <time dateTime={date} title={full} className={cn(className)}>
      {label}
    </time>
  )
}
