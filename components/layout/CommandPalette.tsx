"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, ArrowRight, Command, X } from "lucide-react"
import { cn } from "@/lib/utils"

const ITEMS = [
  { label: "Dashboard", href: "/dashboard", keywords: "home account wallet" },
  { label: "Buy Airtime", href: "/dashboard/services/airtime", keywords: "airtime phone mobile" },
  { label: "Buy Data", href: "/dashboard/services/data", keywords: "data internet bundle" },
  { label: "Pay Electricity", href: "/dashboard/services/electricity", keywords: "electricity power bill meter" },
  { label: "Pay Cable TV", href: "/dashboard/services/cable", keywords: "cable dstv gotv startimes television" },
  { label: "Buy Exam PIN", href: "/dashboard/services/exam-pin", keywords: "waec jamb neco exam education" },
  { label: "Buy ePIN", href: "/dashboard/services/epin", keywords: "epin pin" },
  { label: "Betting", href: "/dashboard/services/betting", keywords: "bet bet9ja sport betting" },
  { label: "International Top-up", href: "/dashboard/services/international-topup", keywords: "international recharge abroad" },
  { label: "Bulk Airtime", href: "/dashboard/services/bulk-airtime", keywords: "bulk airtime business" },
  { label: "Bulk Data", href: "/dashboard/services/bulk-data", keywords: "bulk data business" },
  { label: "Airtime to Cash", href: "/dashboard/services/airtime-to-cash", keywords: "convert airtime cash" },
  { label: "Scheduled Bills", href: "/dashboard/services/scheduled-bills", keywords: "schedule recurring bills" },
  { label: "Wallet", href: "/wallet", keywords: "fund balance wallet" },
  { label: "Rewards", href: "/rewards", keywords: "cashback streak rewards" },
  { label: "History", href: "/history", keywords: "transactions activity orders" },
  { label: "Settings", href: "/settings", keywords: "profile pin security" },
]

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable

      if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault()
        setOpen(true)
        setQuery("")
        setSelected(0)
        return
      }

      if (!open) return
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ITEMS.slice(0, 8)
    return ITEMS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q)).slice(0, 8)
  }, [query])

  useEffect(() => {
    setSelected(0)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search ZamoraxPay"
        className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted md:inline-flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
        <kbd className="rounded border border-border bg-white px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search ZamoraxPay"
        className="mx-auto mt-[8vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setSelected((value) => Math.min(value + 1, Math.max(results.length - 1, 0)))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setSelected((value) => Math.max(value - 1, 0))
              } else if (event.key === "Enter" && results[selected]) {
                event.preventDefault()
                go(results[selected].href)
              }
            }}
            placeholder="What do you want to do?"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">ESC</kbd>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-secondary">No matching service</p>
              <p className="mt-1 text-xs text-muted-foreground">Try airtime, data, electricity, rewards or wallet.</p>
            </div>
          ) : (
            results.map((item, index) => (
              <button
                key={item.href}
                type="button"
                onClick={() => go(item.href)}
                onMouseEnter={() => setSelected(index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                  index === selected ? "bg-primary/8 text-primary" : "text-secondary hover:bg-muted",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {index === selected ? <ArrowRight className="h-4 w-4" /> : <Command className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.keywords}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-secondary">↑↓</span> navigate · <span className="font-medium text-secondary">Enter</span> open · <span className="font-medium text-secondary">Esc</span> close
        </div>
      </div>
    </div>
  )
}
