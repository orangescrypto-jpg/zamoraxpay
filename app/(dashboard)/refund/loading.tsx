// app/(dashboard)/refund/loading.tsx
// Route-level skeleton for the refund page. Mirrors the page's real
// structure — title, description line, order-id input with keypad
// button, result banner area — so first navigation on slow connections
// shows the shape of the page instead of a blank frame.

export default function RefundLoading() {
  return (
    <div className="container max-w-md py-8" aria-busy="true" aria-label="Loading refund page">
      <div className="animate-pulse space-y-4">
        {/* Title + description */}
        <div className="h-8 w-36 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        {/* Order-id input + keypad toggle */}
        <div className="h-11 rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-11 rounded-md bg-muted" />
          <div className="h-11 rounded-md bg-muted" />
        </div>
        {/* Result / review area */}
        <div className="h-32 rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
