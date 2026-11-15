// app/(dashboard)/dashboard/services/page.tsx
// NEW: services index page. The mobile bottom nav's "Services" tab
// previously hard-linked straight to /dashboard/services/data — the
// audit flagged that there was no services landing page at all, so
// every other service (including Airtime, the most common purchase)
// was buried two taps deeper than Data. This grid lists every service
// with a one-line blurb, reusing SERVICE_LINKS from ServiceChrome so
// the index, the ServiceChrome quick-links and the command palette
// can't drift apart. Airtime and Data stay pinned at the top as the
// two highest-frequency actions.
"use client"

import Link from "next/link"
import { ArrowRight, Star } from "lucide-react"
import { SERVICE_LINKS } from "@/components/dashboard/ServiceChrome"

const PINNED = ["/dashboard/services/airtime", "/dashboard/services/data"]

const FAVORITES_KEY = "zamoraxpay:favorite-services"

export default function ServicesIndexPage() {
  // Favorites are read once on mount via a tiny inline effect-less
  // pattern: this page is client-rendered under ServiceChrome, which
  // already hydrates favorites for its own strip. To avoid duplicate
  // localStorage reads fighting each other, this page simply orders
  // pinned items first and renders everything else in a stable,
  // deterministic order (SERVICE_LINKS order).
  const pinned = SERVICE_LINKS.filter((s) => PINNED.includes(s.href))
  const rest = SERVICE_LINKS.filter((s) => !PINNED.includes(s.href))

  return (
    <div className="container max-w-5xl py-5 sm:py-8">
      <div className="mb-5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/dashboard" className="shrink-0 transition-colors hover:text-primary">Dashboard</Link>
        <span className="shrink-0">/</span>
        <span className="shrink-0 text-secondary">Services</span>
      </div>

      <section className="mb-6 rounded-2xl border border-border/80 bg-card/95 p-5 shadow-sm sm:p-6">
        <h1 className="font-heading text-xl font-bold tracking-tight text-secondary sm:text-2xl">All services</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Everything you can pay for on ZamoraxPay, in one place. Top up your phone, settle bills, fund a betting
          wallet or buy exam PINs — all from your wallet balance.
        </p>
      </section>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Most used
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pinned.map(({ href, label, icon: Icon, blurb }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.07]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary">
                {label}
                <Star className="h-3 w-3 fill-primary text-primary" aria-hidden="true" />
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{blurb}</span>
            </span>
            <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Bills & digital products
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rest.map(({ href, label, icon: Icon, blurb }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/25 hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-secondary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-secondary">{label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{blurb}</span>
            </span>
            <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  )
}
