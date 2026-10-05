"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Cable,
  CircleDollarSign,
  Globe2,
  Lightbulb,
  Phone,
  Search,
  Smartphone,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface FinderService {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

const RECENT_KEY = "zamoraxpay:recent-services"
const MAX_RECENT = 4

const SERVICES: FinderService[] = [
  { href: "/dashboard/services/data", label: "Data", description: "Buy mobile data", icon: Smartphone },
  { href: "/dashboard/services/airtime", label: "Airtime", description: "Top up a number", icon: Phone },
  { href: "/dashboard/services/electricity", label: "Electricity", description: "Pay your power bill", icon: Lightbulb },
  { href: "/dashboard/services/cable", label: "Cable TV", description: "Renew your subscription", icon: Cable },
  { href: "/dashboard/services/airtime-to-cash", label: "Airtime to Cash", description: "Convert eligible airtime", icon: CircleDollarSign },
  { href: "/dashboard/services/international-topup", label: "International Top-up", description: "Top up supported countries", icon: Globe2 },
]

function rememberService(href: string) {
  try {
    const current = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")
    const next = [href, ...current.filter((item: unknown) => item !== href)].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // localStorage can be unavailable in privacy-restricted browsers.
  }
}

export function ServiceFinder({ currentHref }: { currentHref?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")
      if (Array.isArray(saved)) setRecent(saved.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT))
    } catch {
      setRecent([])
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return SERVICES
    return SERVICES.filter((service) => `${service.label} ${service.description}`.toLowerCase().includes(value))
  }, [query])

  const recentServices = recent
    .map((href) => SERVICES.find((service) => service.href === href))
    .filter((service): service is FinderService => Boolean(service))
    .filter((service) => service.href !== currentHref)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-secondary shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary"
        aria-label="Find a service"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span>Find a service</span>
        <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">/</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-secondary/35 p-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Find a service">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search data, airtime, electricity..."
                className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Search services"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-secondary" aria-label="Close service search">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3">
              {!query && recentServices.length > 0 && (
                <div className="mb-4">
                  <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recently used</p>
                  <div className="grid gap-1">
                    {recentServices.map((service) => {
                      const Icon = service.icon
                      return (
                        <Link
                          key={`recent-${service.href}`}
                          href={service.href}
                          onClick={() => rememberService(service.href)}
                          className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-primary/[0.06]"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-secondary">{service.label}</span><span className="block text-xs text-muted-foreground">{service.description}</span></span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Services</p>
              <div className="grid gap-1">
                {filtered.map((service) => {
                  const Icon = service.icon
                  return (
                    <Link
                      key={service.href}
                      href={service.href}
                      onClick={() => rememberService(service.href)}
                      className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-primary/[0.06]"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-secondary"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-secondary">{service.label}</span><span className="block text-xs text-muted-foreground">{service.description}</span></span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  )
                })}
              </div>

              {filtered.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">No service matches “{query}”. Try data, airtime or electricity.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
