// lib/d1.ts
// Universal D1 helper for ZAMORAXPAY_DB — works on Vercel (HTTP API),
// Cloudflare Pages/Workers (native binding), or any other Node host.
// This is intentionally identical in shape to Zamorax Marketplace's
// lib/d1.ts, but points at ZamoraxPay's OWN separate D1 database
// (different CF_D1_DATABASE_ID) — the two platforms never share a
// database connection.
//
// Usage:
//   import { d1Query } from "@/lib/d1"
//   await d1Query(sql, params)          // Vercel / generic host (uses CF_API_TOKEN)
//   await d1Query(sql, params, env.DB)  // Cloudflare Pages/Workers (native binding)

import { fetchWithRetry } from "@/lib/fetch-with-retry"

export async function d1Query(
  sql: string,
  params: unknown[] = [],
  nativeDB?: any, // Pass env.DB here when running on Cloudflare Pages/Workers
) {
  // ── Cloudflare native binding ────────────────────────────────
  if (nativeDB) {
    const stmt = nativeDB.prepare(sql)
    const bound = params.length ? stmt.bind(...params) : stmt
    const result = await bound.run()
    return { results: result.results ?? [], success: true }
  }

  // ── Vercel or any non-Cloudflare host — HTTP API ─────────────
  const accountId = process.env.CF_ACCOUNT_ID
  const databaseId = process.env.CF_D1_DATABASE_ID
  const apiToken = process.env.CF_API_TOKEN

  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      "ZamoraxPay D1 not configured: set CF_ACCOUNT_ID, CF_D1_DATABASE_ID, and " +
        "CF_API_TOKEN in your environment variables. This must point at ZamoraxPay's " +
        "OWN D1 database — do not reuse Zamorax Marketplace's database ID.",
    )
  }

  // retryUnsafe: true — this endpoint is POST-shaped but semantically a
  // query dispatch (the SQL text decides read vs write, not the HTTP verb).
  // Safe to re-hit on a timeout/5xx: a dropped connection means the
  // request never reached Cloudflare or the response never came back —
  // not that the query silently ran twice.
  const res = await fetchWithRetry(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ sql, params }),
    },
    { retries: 3, timeoutMs: 8_000, retryUnsafe: true },
  )

  const json = (await res.json()) as any
  if (!json.success) throw new Error(json.errors?.[0]?.message ?? "ZamoraxPay D1 query failed")
  return json.result?.[0]
}
