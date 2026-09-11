// app/api/admin/dashboard-announcement/route.ts
// Admin CRUD for the dashboard announcement strip (shown between
// wallet balance and Quick actions on /dashboard only). Text and
// image are both optional independently — admin can use one, the
// other, or both — but at least one is required so there's something
// to render. Link is always optional; when absent the strip renders
// as plain non-clickable text/image.
//
// Image upload is a separate concern: the admin UI uploads to R2 via
// the existing /api/admin/upload route first, then calls this route
// with the resulting URL.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM dashboard_announcements ORDER BY created_at DESC")
  return NextResponse.json({ announcements: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { text, imageUrl, linkUrl, sortOrder, startsAt, endsAt } = await req.json()

    if (!text && !imageUrl) {
      return NextResponse.json({ error: "Provide text, an image, or both" }, { status: 400 })
    }

    const id = randomUUID()
    await d1Query(
      `INSERT INTO dashboard_announcements (id, text, image_url, link_url, sort_order, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, text ?? null, imageUrl ?? null, linkUrl ?? null, sortOrder ?? 0, startsAt ?? null, endsAt ?? null, auth.uid],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create announcement" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { id, text, imageUrl, linkUrl, sortOrder, isActive, startsAt, endsAt } = await req.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const sets: string[] = []
    const values: unknown[] = []

    if (text !== undefined) { sets.push("text = ?"); values.push(text) }
    if (imageUrl !== undefined) { sets.push("image_url = ?"); values.push(imageUrl) }
    if (linkUrl !== undefined) { sets.push("link_url = ?"); values.push(linkUrl) }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); values.push(sortOrder) }
    if (isActive !== undefined) { sets.push("is_active = ?"); values.push(isActive ? 1 : 0) }
    if (startsAt !== undefined) { sets.push("starts_at = ?"); values.push(startsAt) }
    if (endsAt !== undefined) { sets.push("ends_at = ?"); values.push(endsAt) }

    if (sets.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

    sets.push("updated_at = datetime('now')")
    values.push(id)

    await d1Query(`UPDATE dashboard_announcements SET ${sets.join(", ")} WHERE id = ?`, values)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

  await d1Query("DELETE FROM dashboard_announcements WHERE id = ?", [id])
  return NextResponse.json({ success: true })
}
