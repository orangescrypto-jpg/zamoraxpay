"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"

export interface PurchaseReviewRow {
  label: string
  value: string
}

interface PurchaseReviewDialogProps {
  open: boolean
  title: string
  description?: string
  rows: PurchaseReviewRow[]
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function PurchaseReviewDialog({
  open,
  title,
  description = "Check these details before continuing. The final charge is still validated by the service when you submit.",
  rows,
  confirmLabel = "Confirm and continue",
  loading = false,
  onConfirm,
  onCancel,
}: PurchaseReviewDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="purchase-review-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><CheckCircle2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><h2 id="purchase-review-title" className="text-lg font-semibold text-secondary">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
        </div>
        <dl className="mt-5 space-y-0 divide-y divide-border rounded-2xl border border-border bg-muted/30 px-4">
          {rows.map((row, index) => <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-4 py-3"><dt className="text-sm text-muted-foreground">{row.label}</dt><dd className="max-w-[65%] break-words text-right text-sm font-semibold text-secondary">{row.value || "Not provided"}</dd></div>)}
        </dl>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Review the recipient and amount carefully. Do not confirm if any detail is incorrect.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={loading} onClick={onCancel} className="min-h-11 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-secondary transition hover:bg-muted disabled:opacity-50">Go back</button>
          <button type="button" disabled={loading} onClick={() => void onConfirm()} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Processing..." : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
