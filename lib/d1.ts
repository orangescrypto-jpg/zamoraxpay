// lib/d1.ts
// Universal D1 helper for ZAMORAXPAY_DB.
//
// Resolution order for every query:
//   1. An explicitly passed nativeDB (legacy callers) is used as-is.
//   2. On Cloudflare Workers, the native binding env.DB is resolved
//      automatically through getCloudflareContext(). No caller changes.
//   3. Anywhere else (Vercel, next dev, any non-Cloudflare host), the
//      Cloudflare REST API is used with CF_ACCOUNT_ID, CF_D1_DATABASE_ID,
//      and CF_API_TOKEN.
//
// The REST API is rate limited (1,200 requests / 5 minutes per token), so
// it must never be the path used in production on Workers.
//
// D1 REJECTS raw "BEGIN TRANSACTION" / "SAVEPOINT" SQL sent through either
// the HTTP query endpoint or the native .prepare()/.run() path. There is no
// true cross-statement transaction available here. Callers that need
// multi-row writes should issue independent, idempotent d1Query() calls and
// handle partial failure at the application level.

import { fetchWithRetry } from "@/lib/fetch-with-retry"

// Once we learn there is no Workers binding in this runtime, remember it so
// Vercel and dev pay the probe cost only once.
let bindingUnavailable = false

async function resolveNativeDB(): Promise<any | undefined> {
  if (bindingUnavailable) return undefined
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = await getCloudflareContext({ async: true })
    const db = (env as any)?.DB
    if (db && typeof db.prepare === "function") return db
  } catch {
    // Not running inside a Workers request (Vercel, next dev, Node).
  }
  bindingUnavailable = true
  return undefined
}

export async function d1Query(
  sql: string,
  params: unknown[] = [],
  nativeDB?: any,
) {
  // ── Cloudflare native binding ────────────────────────────────
  const db = nativeDB ?? (await resolveNativeDB())
  if (db) {
    const stmt = db.prepare(sql)
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
      "ZamoraxPay D1 not configured: no DB binding found and CF_ACCOUNT_ID, " +
        "CF_D1_DATABASE_ID, or CF_API_TOKEN is missing. This must point at " +
        "ZamoraxPay's OWN D1 database, not Zamorax Marketplace's.",
    )
  }

  // retryUnsafe: true. This endpoint is POST-shaped but is semantically a
  // query dispatch. The SQL text decides read vs write, not the HTTP verb.
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


// Runs many independent statements as ONE native D1 batch() call per chunk.
// On Workers every D1 call counts toward the per-invocation subrequest cap,
// so N individual d1Query() calls = N subrequests, while batch() = 1 per
// chunk. D1 batch() is also atomic per call. Off Workers (REST fallback)
// it degrades to sequential d1Query() calls. Chunked to stay well inside
// D1's statement-size limits.
export async function d1Batch(
  statements: { sql: string; params?: unknown[] }[],
  nativeDB?: any,
  chunkSize = 50,
): Promise<void> {
  if (statements.length === 0) return
  const db = nativeDB ?? (await resolveNativeDB())
  if (db && typeof db.batch === "function") {
    for (let i = 0; i < statements.length; i += chunkSize) {
      const chunk = statements.slice(i, i + chunkSize).map((st) => {
        const stmt = db.prepare(st.sql)
        return st.params?.length ? stmt.bind(...st.params) : stmt
      })
      await db.batch(chunk)
    }
    return
  }
  for (const st of statements) await d1Query(st.sql, st.params ?? [], nativeDB)
}
