"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ResultBanner } from "@/components/ui/result-banner"

interface ServicePurchaseShellProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  /** Optional purchase result shown above the form */
  result?: { success: boolean; message: string } | null
  onDismissResult?: () => void
}

/**
 * Shared chrome for VTU / bills service pages:
 * consistent title, max-width container, and ResultBanner.
 */
export function ServicePurchaseShell({
  title,
  description,
  children,
  className,
  result,
  onDismissResult,
}: ServicePurchaseShellProps) {
  return (
    <div className={cn("container max-w-md py-6 sm:py-8", className)}>
      <header className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-secondary dark:text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </header>

      {result && (
        <ResultBanner
          className="mb-4"
          variant={result.success ? "success" : "error"}
          title={result.success ? "Success" : "Something went wrong"}
          message={result.message}
          onDismiss={onDismissResult}
        />
      )}

      {children}
    </div>
  )
}
