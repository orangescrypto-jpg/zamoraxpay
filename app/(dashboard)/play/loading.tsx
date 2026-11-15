// app/(dashboard)/play/loading.tsx
// Route-level skeleton for the Play & Earn page. Mirrors the page's
// real structure — title, game cards grid, activity rows — so first
// navigation on slow connections shows the shape of the page instead
// of a blank frame.

export default function PlayLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8" aria-busy="true" aria-label="Loading Play & Earn">
      <div className="animate-pulse space-y-4">
        {/* Title */}
        <div className="h-8 w-40 rounded-lg bg-muted" />
        {/* Game cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted" />
          ))}
        </div>
        {/* Recent plays / leaderboard rows */}
        <div className="h-6 w-44 rounded-lg bg-muted" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
