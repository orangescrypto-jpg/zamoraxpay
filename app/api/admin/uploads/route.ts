// app/api/admin/uploads/route.ts
// Lists previously uploaded images so admin UIs (banners, dashboard
// announcement, blog cover images) can offer "reuse an existing
// image" instead of forcing a fresh upload every time. Reads
// directly from R2 — every image ever uploaded via /api/admin/upload
// shows up here automatically, no extra bookkeeping table needed.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { r2List } from "@/lib/r2/client"

// /api/admin/upload always writes under "<folder>/<uuid>.<ext>" —
// "banners" is currently reused for both site banners and the
// dashboard announcement; "blog" is a separate prefix for cover
// images uploaded from the blog editor (see updated upload route).
const ALLOWED_FOLDERS = ["banners", "blog"] as const

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const folderParam = req.nextUrl.searchParams.get("folder") ?? "banners"
  const folder = (ALLOWED_FOLDERS as readonly string[]).includes(folderParam) ? folderParam : "banners"

  try {
    const files = await r2List(`${folder}/`)
    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list uploads" }, { status: 500 })
  }
}
