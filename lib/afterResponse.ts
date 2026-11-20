// lib/afterResponse.ts
// Runs work AFTER the response has been sent, when the runtime allows it.
//
// On Cloudflare Workers (via the OpenNext adapter) ctx.waitUntil() keeps
// the isolate alive after the Response is returned: the deferred work no
// longer adds to the caller's latency, and an admin save isn't blocked on
// a fan-out of push notifications. IMPORTANT: the CPU the deferred work
// burns is still counted against the same invocation — this moves work off
// the response path, not off the bill.
//
// Everywhere else (next dev, Vercel) there is no waitUntil context, so the
// work simply runs to completion before returning — identical behavior to
// awaiting it inline. Errors never propagate to the caller either way; the
// work passed here must already be best-effort by contract.

type DeferredWork = () => Promise<unknown>

export async function runAfterResponse(work: DeferredWork): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { ctx } = (await getCloudflareContext({ async: true })) as {
      ctx?: { waitUntil?: (promise: Promise<unknown>) => void }
    }
    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(
        Promise.resolve()
          .then(work)
          .catch((err) => console.error("[afterResponse] deferred work failed:", err)),
      )
      return
    }
  } catch {
    // Not running under the OpenNext adapter (next dev / another host) —
    // fall through and run inline.
  }

  try {
    await work()
  } catch (err) {
    console.error("[afterResponse] deferred work failed:", err)
  }
}
