// components/shared/ToastProvider.tsx
// Minimal toast/snackbar system used across the dashboard (wallet funding,
// receipt copy/download, etc). Renders a stack of auto-dismissing toasts
// anchored to the bottom of the viewport and exposes a `useToast()` hook
// that components call as `toast(message, variant?)`.

"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"

type ToastVariant = "success" | "error" | "info"

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

type ToastFn = (message: string, variant?: ToastVariant) => void

const ToastContext = createContext<ToastFn | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-secondary text-white",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-secondary text-white",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback<ToastFn>((message, variant = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((current) => [...current, { id, message, variant }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 2200)
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold shadow-lg ${VARIANT_STYLES[t.variant]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Outside the provider, degrade to a no-op rather than throwing —
    // keeps components usable in isolation/tests.
    return () => {}
  }
  return ctx
}
