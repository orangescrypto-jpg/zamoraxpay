// app/(dashboard)/dashboard/loading.tsx
// Route-level skeleton for the dashboard. The page is client-rendered
// but still streams through the server on first navigation, which
// previously flashed a blank frame on slow connections. This mirrors
// the real page's block layout (balance card, quick actions grid,
// activity rows) so the placeholder-to-content swap reads as content
// arriving, not a layout jump.

export default function DashboardLoading() {
  return (
    <div className="container max-w-4xl py-8" aria-busy="true" aria-label="Loading your dashboard">
      <div className="animate-pulse space-y-4">
        {/* Balance card */}
        <div className="h-40 rounded-2xl bg-muted" />
        {/* Quick actions */}
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
        {/* Recent activity */}
        <div className="h-7 w-40 rounded-lg bg-muted" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
