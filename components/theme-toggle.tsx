"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
  variant?: "icon" | "full"
}

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  if (variant === "full") {
    return (
      <div className={cn("inline-flex rounded-xl border border-border bg-muted/50 p-1", className)} role="group" aria-label="Theme">
        {([
          { value: "light" as const, label: "Light", icon: Sun },
          { value: "dark" as const, label: "Dark", icon: Moon },
          { value: "system" as const, label: "System", icon: Monitor },
        ]).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={theme === value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              theme === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    )
  }

  const cycle = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"]
    const idx = order.indexOf(theme)
    setTheme(order[(idx + 1) % order.length])
  }
  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun
  const label = theme === "system" ? "System theme" : resolvedTheme === "dark" ? "Dark theme" : "Light theme"

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Current theme: ${label}. Click to change.`}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
