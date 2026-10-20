"use client"

import { cn } from "@/lib/utils"

const DEFAULTS = [100, 200, 500, 1000, 2000, 5000]

export function AmountChips({
  value,
  onSelect,
  amounts = DEFAULTS,
  className,
}: {
  value?: string | number
  onSelect: (naira: number) => void
  amounts?: number[]
  className?: string
}) {
  const current = typeof value === "string" ? parseFloat(value) : value
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Quick amounts">
      {amounts.map((n) => {
        const active = current === n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            className={cn(
              "min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-secondary hover:border-primary/40 dark:text-foreground"
            )}
          >
            ₦{n.toLocaleString("en-NG")}
          </button>
        )
      })}
    </div>
  )
}
