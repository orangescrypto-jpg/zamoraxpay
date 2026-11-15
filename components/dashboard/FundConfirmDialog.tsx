// components/dashboard/FundConfirmDialog.tsx
// NEW: accessible confirmation modal for wallet funding.
//
// A11y FIX (audit finding: "wallet fund modal lacks focus trap"): the
// previous inline modal in wallet/page.tsx had no focus trap, no Escape
// handling, and no initial focus — keyboard users could tab into the
// page behind the overlay and Escape did nothing. This component
// mirrors the behavior of PurchaseReviewDialog (focus trap, Escape to
// cancel, overlay click to cancel, focus restored to the trigger on
// close) while keeping the exact same visual design.
"use client"

import { useEffect, useRef } from "react"
import { formatNaira } from "@/lib/utils"

interface FundConfirmDialogProps {
  amountKobo: number
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FundConfirmDialog({ amountKobo, loading, onCancel, onConfirm }: FundConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const dialog = dialogRef.current
    if (!dialog) return

    // Initial focus: the Cancel button, so a stray Enter/Space can never
    // confirm a charge unintentionally — the user must actively select
    // Confirm to move money.
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusables[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      const root = dialogRef.current
      if (!root) return
      if (e.key === "Escape") {
        e.preventDefault()
        if (!loading) onCancel()
        return
      }
      if (e.key !== "Tab") return

      // Simple focus trap: cycle Tab within the dialog.
      const current = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (current.length === 0) return
      const first = current[0]
      const last = current[current.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocusedRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-secondary/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm wallet funding"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
    >
      <div ref={dialogRef} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Review funding</p>
        <h2 className="mt-1 text-xl font-heading font-bold text-secondary dark:text-foreground">Fund your wallet?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You are about to fund your wallet with{" "}
          <strong className="text-secondary dark:text-foreground">{formatNaira(amountKobo)}</strong>.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-muted disabled:opacity-50 dark:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Starting..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}
