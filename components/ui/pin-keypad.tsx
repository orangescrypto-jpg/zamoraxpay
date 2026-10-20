"use client"

import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const

export function PinKeypad({
  value,
  onChange,
  length = 4,
  className,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  length?: number
  className?: string
  disabled?: boolean
}) {
  function press(key: string) {
    if (disabled) return
    if (key === "del") {
      onChange(value.slice(0, -1))
      return
    }
    if (!key || value.length >= length) return
    onChange(value + key)
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-center gap-3" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 transition",
              i < value.length ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"
            )}
          />
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={`empty-${i}`} />
          ) : (
            <button
              key={key + i}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              className="flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-lg font-semibold text-secondary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-50 dark:text-foreground"
              aria-label={key === "del" ? "Delete" : key}
            >
              {key === "del" ? <Delete className="h-5 w-5" /> : key}
            </button>
          )
        )}
      </div>
      {/* Hidden input keeps password managers / autofill less noisy; value is controlled */}
      <input type="password" inputMode="numeric" autoComplete="off" value={value} readOnly className="sr-only" tabIndex={-1} aria-hidden />
    </div>
  )
}
