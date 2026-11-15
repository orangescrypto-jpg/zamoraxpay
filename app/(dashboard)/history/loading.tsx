// app/(dashboard)/history/loading.tsx
// Route-level skeleton for the transaction history page. Mirrors the
// page's real structure — title row, sticky search/filter bar, then
// transaction rows — so first navigation on slow connections shows the
// shape of the page instead of a blank frame.

export default function HistoryLoading() {
  return (
    <div className="container max-w-2xl py-8" aria-busy="true" aria-label="Loading your history">
      <div className="animate-pulse space-y-4">
        {/* Title row */}
        <div className="h-8 w-40 rounded-lg bg-muted" />
        {/* Sticky filter bar */}
        <div className="rounded-2xl border border-border bg-background/95 p-2">
          <div className="h-10 rounded-xl bg-muted" />
          <div className="mt-2 flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-16 rounded-full bg-muted" />
            ))}
          </div>
        </div>
        {/* Transaction rows */}
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[4.5rem] rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
