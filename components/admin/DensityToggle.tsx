"use client"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
const KEY = "zamoraxpay:admin-density"
export function DensityToggle({ className }: { className?: string }) {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) === "compact"
      setCompact(v)
      document.documentElement.classList.toggle("zpx-admin-compact", v)
    } catch {}
  }, [])
  function toggle() {
    setCompact((c) => {
      const next = !c
      try { localStorage.setItem(KEY, next ? "compact" : "comfortable") } catch {}
      document.documentElement.classList.toggle("zpx-admin-compact", next)
      return next
    })
  }
  return (
    <button type="button" onClick={toggle} className={cn("rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted", className)} title="Toggle table density">
      {compact ? "Compact" : "Comfortable"}
    </button>
  )
}
