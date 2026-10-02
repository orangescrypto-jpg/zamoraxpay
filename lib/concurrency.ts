// lib/concurrency.ts
// Bounded-concurrency helper for per-row cron loops that do network or
// D1 calls. Added to fix Vercel Hobby plan duration/invocation risk:
// plain sequential `for...of` loops over unbounded or large row sets
// (per-user pushes, per-order reconciliation, etc.) were the dominant
// risk shape found across zamoraxpay's cron routes — this mirrors the
// same bounded-concurrency pattern already applied in the Zamorax
// project. Runs `items` through `fn` in chunks of `chunkSize`,
// resolving each chunk concurrently via Promise.all, with one item's
// rejection isolated via allSettled so it can't abort its chunk.

export async function runInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ item: T; result?: R; error?: unknown }>> {
  const out: Array<{ item: T; result?: R; error?: unknown }> = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize)
    const settled = await Promise.allSettled(slice.map((item, j) => fn(item, i + j)))
    settled.forEach((s, j) => {
      if (s.status === "fulfilled") {
        out.push({ item: slice[j], result: s.value })
      } else {
        out.push({ item: slice[j], error: s.reason })
      }
    })
  }
  return out
}
