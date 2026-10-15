"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search, ArrowUpRight } from "lucide-react"

type Service = { href: string; label: string; desc: string }
export function ServiceQuickSearch({ services }: { services: Service[] }) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return services.filter((service) => `${service.label} ${service.desc}`.toLowerCase().includes(term)).slice(0, 5)
  }, [query, services])
  return <div className="relative mb-5">
    <label className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="sr-only">Find a service</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a service, e.g. electricity or data..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Search</kbd>
    </label>
    {query.trim() && <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-white shadow-xl">
      {results.length ? results.map((service) => <Link key={service.href} href={service.href} onClick={() => setQuery("")} className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 last:border-0 hover:bg-muted/60"><span><span className="block text-sm font-semibold text-secondary">{service.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{service.desc}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></Link>) : <p className="px-4 py-5 text-sm text-muted-foreground">No matching service. Try another keyword.</p>}
    </div>}
  </div>
}
