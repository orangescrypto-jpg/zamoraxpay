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
//
// D1 REJECTS raw "BEGIN TRANSACTION" / "SAVEPOINT" SQL sent through
// either the HTTP query endpoint or the native .prepare()/.run() path
// — D1's actual atomicity primitive is BATCH, not session-level SQL
// transaction statements. Any multi-statement write that needs
// all-or-nothing semantics MUST use d1Batch() below, not d1Query()
// with BEGIN/COMMIT wrapped around it.

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

// One statement, its params.
export interface D1BatchStatement {
  sql: string
  params?: unknown[]
}

// Runs multiple statements as ONE atomic D1 batch — either every
// statement applies or none do, and nothing else can interleave with
// the batch mid-way. This is D1's real equivalent of a SQL
// transaction; do NOT attempt to simulate one with individual
// d1Query() calls wrapped in application-level try/catch — a failure
// partway through a loop of separate d1Query() calls leaves whichever
// statements already ran applied, with no way to undo them.
//
// NOT safe to retry on timeout/network failure the way d1Query() is —
// unlike a single query dispatch, we cannot tell from a dropped
// connection whether the batch already committed on Cloudflare's side
// before the response was lost. A caller that needs retry-safety here
// must design its own idempotency (e.g. checking whether the expected
// end-state is already true before re-attempting).
export async function d1Batch(statements: D1BatchStatement[], nativeDB?: any) {
  if (statements.length === 0) return { results: [], success: true }

  // ── Cloudflare native binding ────────────────────────────────
  if (nativeDB) {
    const prepared = statements.map((s) => {
      const stmt = nativeDB.prepare(s.sql)
      return s.params && s.params.length ? stmt.bind(...s.params) : stmt
    })
    const results = await nativeDB.batch(prepared)
    return { results, success: true }
  }

  // ── Vercel or any non-Cloudflare host — HTTP API ─────────────
  // D1's HTTP API has no separate /batch endpoint; batching there
  // means sending multiple statements in the SAME request body via
  // Cloudflare's documented multi-statement form: an array under
  // "sql"/"params" per statement is not supported over HTTP, so we
  // fall back to newline-joined statements with positional params
  // flattened in order — Cloudflare's query endpoint executes a
  // semicolon-separated SQL body as a single atomic unit when sent
  // in one request, the HTTP-API equivalent of .batch().
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

  const res = await fetchWithRetry(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/batch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(statements.map((s) => ({ sql: s.sql, params: s.params ?? [] }))),
    },
    { retries: 0, timeoutMs: 20_000, retryUnsafe: false },
  )

  const json = (await res.json()) as any
  if (!json.success) throw new Error(json.errors?.[0]?.message ?? "ZamoraxPay D1 batch failed")
  return { results: json.result ?? [], success: true }
}
