// lib/r2/client.ts
// Cloudflare R2 file storage for ZamoraxPay (banners, page images, receipts).
// Uses ZamoraxPay's OWN bucket (R2_BUCKET), separate from Zamorax Marketplace.
//
// Two paths, chosen automatically:
//   1. Native R2 binding env.ZAMORAXPAY_BUCKET, resolved through
//      getCloudflareContext() on Workers. No AWS SDK loaded, no network hop,
//      no credentials needed. This is the production path.
//   2. S3-compatible client via @aws-sdk/client-s3. Loaded lazily, only when
//      no binding exists (Vercel, next dev). Never bundled into the Worker's
//      hot path.
//
// Callers keep using r2Put / r2Get / r2List. Passing nativeBucket still works.

interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: { key: string; uploaded: Date; size: number }[]
    truncated: boolean
    cursor?: string
  }>
}

let bindingUnavailable = false

function isBucket(value: unknown): value is R2Bucket {
  return !!value && typeof (value as R2Bucket).put === "function"
}

async function resolveBucket(nativeBucket?: unknown): Promise<R2Bucket | null> {
  if (isBucket(nativeBucket)) return nativeBucket
  if (bindingUnavailable) return null
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as any)?.ZAMORAXPAY_BUCKET
    if (isBucket(bucket)) return bucket
  } catch {
    // Not running inside a Workers request.
  }
  bindingUnavailable = true
  return null
}

// ── Fallback S3-compatible client (Vercel / next dev only) ───────────
let _r2Client: any | undefined

async function r2Client(): Promise<any> {
  if (_r2Client) return _r2Client

  if (!process.env.R2_ENDPOINT) throw new Error("Missing R2_ENDPOINT")
  if (!process.env.R2_ACCESS_KEY_ID) throw new Error("Missing R2_ACCESS_KEY_ID")
  if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("Missing R2_SECRET_ACCESS_KEY")

  const { S3Client } = await import("@aws-sdk/client-s3")
  const { NodeHttpHandler } = await import("@smithy/node-http-handler")

  _r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // Fail fast instead of hanging the function (see upload spinner history).
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 10000,
      requestTimeout: 10000,
    }),
    maxAttempts: 1,
  })
  return _r2Client
}

export function R2_BUCKET(): string {
  const v = process.env.R2_BUCKET
  if (!v) throw new Error("Missing R2_BUCKET")
  return v
}

export function R2_PUBLIC_URL(): string {
  const v = process.env.R2_PUBLIC_URL
  if (!v) throw new Error("Missing R2_PUBLIC_URL")
  return v
}

// ── Unified helpers ──────────────────────────────────────────────────

export async function r2Put(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  nativeBucket?: unknown,
): Promise<void> {
  const bucket = await resolveBucket(nativeBucket)

  if (bucket) {
    await bucket.put(key, body, { httpMetadata: { contentType } })
    return
  }

  const { PutObjectCommand } = await import("@aws-sdk/client-s3")
  await (await r2Client()).send(
    new PutObjectCommand({
      Bucket: R2_BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  )
}

export async function r2Get(
  key: string,
  nativeBucket?: unknown,
): Promise<ArrayBuffer | null> {
  const bucket = await resolveBucket(nativeBucket)

  if (bucket) {
    const obj = await bucket.get(key)
    return obj ? await obj.arrayBuffer() : null
  }

  const { GetObjectCommand } = await import("@aws-sdk/client-s3")
  const result = await (await r2Client()).send(
    new GetObjectCommand({ Bucket: R2_BUCKET(), Key: key }),
  )
  const body = result.Body as any
  if (!body) return null
  return await body.transformToByteArray()
}

// Lists previously uploaded files under a prefix (e.g. "banners/") for the
// admin "reuse an existing image" picker. Newest first, capped at `limit`.
export async function r2List(
  prefix: string,
  nativeBucket?: unknown,
  limit = 100,
): Promise<{ key: string; url: string; uploadedAt: string | null; size: number }[]> {
  const bucket = await resolveBucket(nativeBucket)
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

  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3")
  const result = await (await r2Client()).send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET(), Prefix: prefix, MaxKeys: limit }),
  )
  return (result.Contents ?? [])
    .filter((obj: any): obj is any & { Key: string } => !!obj.Key)
    .sort((a: any, b: any) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .map((obj: any) => ({
      key: obj.Key,
      url: `${baseUrl}/${obj.Key}`,
      uploadedAt: obj.LastModified ? obj.LastModified.toISOString() : null,
      size: obj.Size ?? 0,
    }))
}
