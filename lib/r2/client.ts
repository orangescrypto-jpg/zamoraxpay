// lib/r2/client.ts
// Cloudflare R2 file storage for ZamoraxPay (banners, page images,
// receipts). Uses ZamoraxPay's OWN bucket (R2_BUCKET env var) —
// entirely separate from Zamorax Marketplace's bucket.
//
// Two paths:
//   1. Native R2 binding (env.ZAMORAXPAY_BUCKET) — used automatically when
//      running on Cloudflare Workers/Pages. No AWS SDK, no network hop,
//      no credentials needed. This is the path used in production.
//   2. S3-compatible client via @aws-sdk/client-s3 — used only as a
//      fallback for local `next dev` / non-Workers hosting, where there
//      is no native binding available.
//
// Callers should prefer r2Put / r2Get below rather than reaching for
// S3Client directly, so the binding path is always used when present.
// ─────────────────────────────────────────────────────────────────

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { NodeHttpHandler } from "@smithy/node-http-handler"

// Minimal shape of the Cloudflare R2 binding (avoids a hard dependency
// on @cloudflare/workers-types here; full type comes from worker-configuration.d.ts
// once `wrangler types` has been run).
interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: { key: string; uploaded: Date; size: number }[]
    truncated: boolean
    cursor?: string
  }>
}

// ── Native binding path ─────────────────────────────────────────────
function getNativeBucket(nativeBucket?: unknown): R2Bucket | null {
  if (nativeBucket && typeof (nativeBucket as R2Bucket).put === "function") {
    return nativeBucket as R2Bucket
  }
  return null
}

// ── Fallback S3-compatible client (local dev only) ──────────────────
function getR2Client(): S3Client {
  if (!process.env.R2_ENDPOINT)          throw new Error("Missing R2_ENDPOINT")
  if (!process.env.R2_ACCESS_KEY_ID)     throw new Error("Missing R2_ACCESS_KEY_ID")
  if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("Missing R2_SECRET_ACCESS_KEY")

  return new S3Client({
    region:   "auto",
    endpoint: process.env.R2_ENDPOINT,  // https://<account-id>.r2.cloudflarestorage.com
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // Without this, the SDK's default socket/connect timeouts can be long
    // enough (well over a minute) that a Vercel function just hangs instead
    // of failing fast — which is exactly what made the upload spinner never
    // resolve. 10s is generous for a same-region R2 PUT.
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 10000,
      requestTimeout:    10000,
    }),
    maxAttempts: 1,
  })
}

// Lazy singleton — created once on first real request, never at import time.
let _r2Client: S3Client | undefined
export function r2Client(): S3Client {
  if (!_r2Client) _r2Client = getR2Client()
  return _r2Client
}

export function R2_BUCKET(): string {
  const v = process.env.R2_BUCKET
  if (!v) throw new Error("Missing R2_BUCKET")
  return v
}

export function R2_PUBLIC_URL(): string {
  const v = process.env.R2_PUBLIC_URL  // https://files.zamoraxpay.com.ng
  if (!v) throw new Error("Missing R2_PUBLIC_URL")
  return v
}

// ── Unified helpers — use these from route handlers ──────────────────
// Pass `nativeBucket` (env.ZAMORAXPAY_BUCKET from the Cloudflare request
// context) when available. Falls back to the S3-compatible client
// when nativeBucket is undefined (e.g. local `next dev`).

export async function r2Put(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  nativeBucket?: unknown,
): Promise<void> {
  const bucket = getNativeBucket(nativeBucket)

  if (bucket) {
    await bucket.put(key, body, { httpMetadata: { contentType } })
    return
  }

  // Fallback: AWS SDK against R2's S3-compatible endpoint
  await r2Client().send(
    new PutObjectCommand({
      Bucket:      R2_BUCKET(),
      Key:         key,
      Body:        body,
      ContentType: contentType || "application/octet-stream",
    }),
  )
}

export async function r2Get(
  key: string,
  nativeBucket?: unknown,
): Promise<ArrayBuffer | null> {
  const bucket = getNativeBucket(nativeBucket)

  if (bucket) {
    const obj = await bucket.get(key)
    return obj ? await obj.arrayBuffer() : null
  }

  // Fallback: AWS SDK
  const result = await r2Client().send(
    new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
  )
  const body = result.Body as any
  if (!body) return null
  return await body.transformToByteArray()
}

// Lists previously uploaded files under a prefix (e.g. "banners/") so
// admin UIs can offer "reuse an existing image" instead of forcing a
// fresh upload every time. Returns newest first, capped at `limit`
// (default 100 — plenty for a picker grid, keeps the response small).
export async function r2List(
  prefix: string,
  nativeBucket?: unknown,
  limit = 100,
): Promise<{ key: string; url: string; uploadedAt: string | null; size: number }[]> {
  const bucket = getNativeBucket(nativeBucket)
  const baseUrl = R2_PUBLIC_URL()

  if (bucket) {
    const result = await bucket.list({ prefix, limit })
    return result.objects
      .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
      .map((obj) => ({
        key: obj.key,
        url: `${baseUrl}/${obj.key}`,
        uploadedAt: obj.uploaded ? new Date(obj.uploaded).toISOString() : null,
        size: obj.size,
      }))
  }

  // Fallback: AWS SDK
  const result = await r2Client().send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET(), Prefix: prefix, MaxKeys: limit }),
  )
  return (result.Contents ?? [])
    .filter((obj): obj is typeof obj & { Key: string } => !!obj.Key)
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .map((obj) => ({
      key: obj.Key,
      url: `${baseUrl}/${obj.Key}`,
      uploadedAt: obj.LastModified ? obj.LastModified.toISOString() : null,
      size: obj.Size ?? 0,
    }))
}
