// app/error.tsx
// Global error boundary. Renders for any uncaught exception in a
// server component OR client component below this layout. Lets users
// recover without leaving the app - they get a "Try again" button that
// remounts the segment instead of being dumped on a blank page.
//
// Important: this is a Client Component (must be "use client") because
// Next.js calls its `reset()` to retry rendering.

"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw, Home } from "lucide-react"
import Link from "next/link"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Could be wired to Sentry / Datadog. For now, surface to console
    // so dev mode shows it without leaking details to the UI.
    // eslint-disable-next-line no-console
    console.error("ZamoraxPay route error:", error)
  }, [error])

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-heading font-bold text-secondary">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We hit an unexpected error while loading this page. Your money and account are safe. Please try again.
      </p>
      {error.digest && (
        <p className="mt-3 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-secondary hover:bg-muted"
        >
          <Home className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
