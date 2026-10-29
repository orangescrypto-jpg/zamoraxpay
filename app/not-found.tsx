// app/not-found.tsx
// Custom 404 page. The default Next.js 404 is a blank page - for a
// fintech where users may fat-finger a URL (e.g. /dashbord instead of
// /dashboard), give them a clear path back to the dashboard, wallet,
// and search instead of stranding them.

import Link from "next/link"
import { Home, Search, Wallet, HelpCircle } from "lucide-react"

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-heading text-7xl font-bold tracking-tight text-primary">404</p>
      <h1 className="mt-3 text-2xl font-heading font-bold text-secondary">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you are looking for may have moved, been renamed, or never existed. Try one of these instead.
      </p>
      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <Link
          href="/wallet"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-secondary hover:bg-muted"
        >
          <Wallet className="h-4 w-4" />
          Wallet
        </Link>
        <Link
          href="/blog"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-secondary hover:bg-muted"
        >
          <Search className="h-4 w-4" />
          Browse blog
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-secondary hover:bg-muted"
        >
          <HelpCircle className="h-4 w-4" />
          Contact support
        </Link>
      </div>
    </div>
  )
}
