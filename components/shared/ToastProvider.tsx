// components/shared/ToastProvider.tsx
// Toast/snackbar system used across the dashboard (wallet funding,
// receipt copy/download, etc). Renders a stack of toasts anchored to the
// bottom of the viewport and exposes a `useToast()` hook that components
// call as `toast(message, variant?, options?)`.
//
// UX audit fixes (previously): fixed 2.2s auto-dismiss with no manual
// dismiss and no action support — a failure toast vanished before it
// could be read, and there was no way to act on a toast. Now:
//   - error toasts persist until dismissed (auto-dismiss kept for
//     success/info, where the message is confirmatory)
//   - every toast is manually dismissible
//   - optional action button (label + onClick), used by the
//     purchase-status toast and cashback toast
//   - pauses auto-dismiss on hover/focus so reading is never cut short
//   - capped stack (max 3 visible) so a burst of events can't flood
//     the viewport

"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"

type ToastVariant = "success" | "error" | "info"

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  /** Auto-dismiss delay in ms. Defaults by variant: success/info 2600ms, error 0 (persist). */
  durationMs?: number
  /** Optional inline action, e.g. "View receipt". */
  action?: ToastAction
}

interface ToastItem extends Required<Pick<Toast, "id" | "message" | "variant">> {
  durationMs: number
  action?: ToastAction
}

interface Toast {
  id: string
  message: string
  variant: ToastVariant
  options?: ToastOptions
}

type ToastFn = (message: string, variant?: ToastVariant, options?: ToastOptions) => void

const ToastContext = createContext<ToastFn | null>(null)

const MAX_VISIBLE = 3

const VARIANT_STYLES: Record<ToastVariant, string> = {
  // success: accent green so users can visually distinguish a successful
  // action from a neutral info notice.
  success: "bg-accent text-accent-foreground",
  error: "bg-destructive text-destructive-foreground",
  info: "bg-secondary text-secondary-foreground",
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  // Hover/focus pauses the auto-dismiss timer so a toast never
  // disappears while the user is actively reading it.
  const pausedRef = useRef(false)
  const remainingRef = useRef(toast.durationMs)
  // startedAt is only meaningful while a timer runs; initialize to 0 and
  // stamp it inside startTimer (keeps render pure — Date.now() during
  // render trips the impure-function lint rule).
  const startedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    if (remainingRef.current <= 0) return
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => onDismiss(toast.id), remainingRef.current)
  }, [clearTimer, onDismiss, toast.id])

  useEffect(() => {
    startTimer()
    return clearTimer
  }, [startTimer, clearTimer])

  const pause = useCallback(() => {
    if (!timerRef.current) return
    remainingRef.current -= Date.now() - startedAtRef.current
    clearTimer()
    pausedRef.current = true
  }, [clearTimer])

  const resume = useCallback(() => {
    pausedRef.current = false
    startTimer()
  }, [startTimer])

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto flex w-auto max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full py-2 pl-4 pr-2 text-xs font-semibold shadow-lg ${VARIANT_STYLES[toast.variant]}`}
    >
      <span className="min-w-0 flex-1 text-left">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick()
            onDismiss(toast.id)
          }}
          className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastFn>((message, variant = "info", options) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // 0 means "persist until dismissed" — reserved for errors and
    // toasts carrying an action the user may want to tap.
    const durationMs = options?.durationMs ?? (variant === "error" || options?.action ? 0 : 2600)
    setToasts((current) => [...current, { id, message, variant, options: { ...options, durationMs } }])
  }, [])

  // Cap the visible stack: drop the OLDEST toasts when a burst floods
  // the queue (e.g. several purchase status changes landing together).
  const visible = toasts.slice(-MAX_VISIBLE)

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {visible.map((t) => (
          <ToastCard key={t.id} toast={t as ToastItem} onDismiss={dismiss} />
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
