// app/api/admin/upload/route.ts
// Generic admin file upload (banner images, dashboard announcement
// images, blog cover images) — stores to R2 and returns the public
// URL for the admin panel to attach. Pass context.env.ZAMORAXPAY_BUCKET
// as nativeBucket when deployed on Cloudflare Pages; falls back to
// the S3-compatible client automatically otherwise (see lib/r2/client.ts).
//
// Accepts an optional "folder" form field ("banners" | "blog") so
// files are grouped by use — this is also what /api/admin/uploads
// lists by when offering "reuse an existing image" pickers. Defaults
// to "banners" for backward compatibility with existing callers.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { r2Put, R2_PUBLIC_URL } from "@/lib/r2/client"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_FOLDERS = ["banners", "blog"] as const

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folderField = (formData.get("folder") as string | null) ?? "banners"
    const folder = (ALLOWED_FOLDERS as readonly string[]).includes(folderField) ? folderField : "banners"

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WEBP, and GIF images are allowed" }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 })
    }

    const extension = file.type.split("/")[1]
    const key = `${folder}/${randomUUID()}.${extension}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await r2Put(key, buffer, file.type)

    return NextResponse.json({ url: `${R2_PUBLIC_URL()}/${key}` })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 })
  }
}
