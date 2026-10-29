// app/loading.tsx
// Global loading UI. Renders inside Suspense boundaries while server
// components are streaming. Kept deliberately minimalist - just three
// pulse blocks - so it doesn't visually compete with real content.

export default function Loading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12" aria-busy="true" aria-label="Loading page">
      <div className="space-y-4">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
