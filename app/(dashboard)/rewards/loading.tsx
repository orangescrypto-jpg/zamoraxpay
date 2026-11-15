// app/(dashboard)/rewards/loading.tsx
// Route-level skeleton for the rewards page. Mirrors the page's real
// structure — title, streak check-in card, spin card, reward rows —
// so first navigation on slow connections shows the shape of the page
// instead of a blank frame.

export default function RewardsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8" aria-busy="true" aria-label="Loading your rewards">
      <div className="animate-pulse space-y-4">
        {/* Title */}
        <div className="h-8 w-44 rounded-lg bg-muted" />
        {/* Streak check-in card */}
        <div className="h-40 rounded-2xl bg-muted" />
        {/* Spin & Win card */}
        <div className="h-48 rounded-2xl bg-muted" />
        {/* Reward history rows */}
        <div className="h-6 w-40 rounded-lg bg-muted" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
