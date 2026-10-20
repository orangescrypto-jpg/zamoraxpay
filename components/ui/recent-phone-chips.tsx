"use client"

import { useEffect, useState } from "react"
import { getRecentPhones } from "@/lib/recentPhones"
import { cn } from "@/lib/utils"

export function RecentPhoneChips({
  onSelect,
  className,
}: {
  onSelect: (phone: string) => void
  className?: string
}) {
  const [phones, setPhones] = useState<string[]>([])
  useEffect(() => {
    setPhones(getRecentPhones())
  }, [])
  if (phones.length === 0) return null
  return (
    <div className={cn("mt-2 flex flex-wrap gap-2", className)} role="group" aria-label="Recent numbers">
      {phones.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-secondary hover:border-primary/40 hover:text-primary dark:text-foreground active:scale-95"
        >
          {p}
        </button>
      ))}
    </div>
  )
}
