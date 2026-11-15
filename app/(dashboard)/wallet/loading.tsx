// app/(dashboard)/wallet/loading.tsx
// Route-level skeleton for the wallet page. Mirrors the page's real
// structure — balance header, action buttons, funding/transaction
// cards — so first navigation on slow connections shows the shape of
// the page instead of a blank frame.

export default function WalletLoading() {
  return (
    <div className="container max-w-2xl py-8" aria-busy="true" aria-label="Loading your wallet">
      <div className="animate-pulse space-y-4">
        {/* Balance header */}
        <div className="h-8 w-36 rounded-lg bg-muted" />
        <div className="h-44 rounded-2xl bg-muted" />
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 rounded-xl bg-muted" />
          <div className="h-12 rounded-xl bg-muted" />
        </div>
        {/* Transactions list */}
        <div className="h-6 w-44 rounded-lg bg-muted" />
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
