"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Bookmark, Clock3, Command, LayoutDashboard, Search, Settings2, Wallet, X } from "lucide-react"

const PAGES = [
  { href: "/dashboard", label: "Dashboard", description: "Overview and service shortcuts", keywords: "home overview" },
  { href: "/wallet", label: "Wallet", description: "Fund your wallet and review balance", keywords: "fund balance payment" },
  { href: "/history", label: "Transaction history", description: "Find purchases and transaction receipts", keywords: "orders receipts airtime data" },
  { href: "/beneficiaries", label: "Beneficiaries", description: "Manage frequently used recipients", keywords: "contacts recipients" },
  { href: "/settings", label: "Settings", description: "Manage account preferences and security", keywords: "profile pin security" },
  { href: "/referrals", label: "Referrals", description: "View your referral activity", keywords: "invite earn" },
  { href: "/rewards", label: "Rewards", description: "Explore available rewards", keywords: "bonus prize" },
  { href: "/cashback", label: "Cashback", description: "Review cashback activity", keywords: "money savings" },
  { href: "/daily-streak", label: "Daily streak", description: "Check your daily activity streak", keywords: "daily consistency" },
  { href: "/reseller", label: "Reseller", description: "Explore reseller tools", keywords: "business sell" },
  { href: "/refund", label: "Refunds", description: "Review refund guidance and requests", keywords: "failed order dispute" },
  { href: "/spin", label: "Spin", description: "Open the available spin experience", keywords: "game play" },
  { href: "/play", label: "Play zone", description: "Explore available play features", keywords: "games" },
]
const RECENT_KEY = "zamoraxpay:recent-dashboard-pages"
const PIN_KEY = "zamoraxpay:pinned-dashboard-pages"

export function DashboardWorkspace() {
  const pathname = usePathname() || ""
  const [query, setQuery] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  const [pinned, setPinned] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  const current = PAGES.find((page) => page.href === pathname)
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return PAGES.filter((page) => page.href !== pathname).slice(0, 5)
    return PAGES.filter((page) => `${page.label} ${page.description} ${page.keywords}`.toLowerCase().includes(normalized)).slice(0, 7)
  }, [query, pathname])

  useEffect(() => {
    try {
      const readList = (key: string) => {
        const value = JSON.parse(localStorage.getItem(key) || "[]")
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
      }
      setRecent(readList(RECENT_KEY))
      setPinned(readList(PIN_KEY))
    } catch {
      setRecent([])
      setPinned([])
    }
  }, [])

  useEffect(() => {
    if (!current) return
    setRecent((previous) => {
      const next = [current.href, ...previous.filter((href) => href !== current.href)].slice(0, 5)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [current?.href])

  function togglePinned(href: string) {
    setPinned((previous) => {
      const next = previous.includes(href) ? previous.filter((item) => item !== href) : [href, ...previous].slice(0, 6)
      try { localStorage.setItem(PIN_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/dashboard/services/") || !pathname.match(/^\/(wallet|history|beneficiaries|settings|referrals|rewards|cashback|daily-streak|reseller|refund|spin|play)$/)) return null

  return (
    <section className="container max-w-6xl pt-4 sm:pt-6" aria-label="Account workspace tools">
      <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutDashboard className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Your workspace</p>
              <p className="truncate text-sm font-semibold text-secondary">{current?.label ?? "Account tools"}</p>
              <p className="text-xs text-muted-foreground">{current?.description ?? "Jump between account features without losing your place."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-secondary transition hover:border-primary/40 hover:text-primary" aria-expanded={open}>
              {open ? <X className="h-3.5 w-3.5" /> : <Command className="h-3.5 w-3.5" />} {open ? "Close navigator" : "Quick navigator"}
            </button>
            {current && <button type="button" onClick={() => togglePinned(current.href)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${pinned.includes(current.href) ? "bg-primary text-white" : "border border-border bg-background text-secondary hover:border-primary/40 hover:text-primary"}`}><Bookmark className="h-3.5 w-3.5" />{pinned.includes(current.href) ? "Pinned" : "Pin page"}</button>}
          </div>
        </div>

        {open && <div className="mt-4 border-t border-border pt-4">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a page, feature, or task..." className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((page) => <Link key={page.href} href={page.href} onClick={() => setOpen(false)} className="group rounded-xl border border-border/80 p-3 transition hover:border-primary/40 hover:bg-primary/[0.03]"><span className="flex items-center justify-between gap-2 text-sm font-semibold text-secondary group-hover:text-primary">{page.label}<ArrowRight className="h-3.5 w-3.5 shrink-0" /></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{page.description}</span></Link>)}
            {results.length === 0 && <p className="py-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No pages match that search. Try a different keyword.</p>}
          </div>
        </div>}

        {(pinned.length > 0 || recent.filter((href) => href !== pathname).length > 0) && <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          {pinned.length > 0 && <div className="min-w-0"><p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><Bookmark className="h-3 w-3" />Pinned pages</p><div className="flex flex-wrap gap-1.5">{pinned.map((href) => { const page = PAGES.find((item) => item.href === href); return page ? <span key={href} className="inline-flex items-center gap-1 rounded-lg bg-primary/[0.07] pl-2.5 pr-1 py-1 text-xs font-medium text-secondary"><Link href={href} className="hover:text-primary">{page.label}</Link><button type="button" onClick={() => togglePinned(href)} aria-label={`Unpin ${page.label}`} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"><X className="h-3 w-3" /></button></span> : null })}</div></div>}
          {recent.filter((href) => href !== pathname).length > 0 && <div className="min-w-0"><p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><Clock3 className="h-3 w-3" />Recently visited</p><div className="flex flex-wrap gap-1.5">{recent.filter((href) => href !== pathname).slice(0, 4).map((href) => { const page = PAGES.find((item) => item.href === href); return page ? <Link key={href} href={href} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-secondary transition hover:border-primary/40 hover:text-primary">{page.label}</Link> : null })}</div></div>}
        </div>}
      </div>
    </section>
  )
}
