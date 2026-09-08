// app/api/admin/banners/route.ts
// Admin CRUD for header-slider and footer banners — including the
// Zamorax Marketplace cross-promotion banner and any other ads.
// Image upload is a separate concern: the admin UI uploads the image
// to R2 first (getting back a URL), then calls this route with that
// URL — keeping this route simple JSON in/out.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  // Banners are shown to the public storefront too, not just admin —
  // but the admin listing view wants ALL banners (including inactive
  // ones), so this route is admin-only. Public storefront reads via a
  // separate lightweight route (see components fetching banners).
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const result = await d1Query("SELECT * FROM banners ORDER BY placement, sort_order")
  return NextResponse.json({ banners: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { placement, title, imageUrl, linkUrl, sortOrder, startsAt, endsAt } = await req.json()

    if (!placement || !imageUrl) {
      return NextResponse.json({ error: "placement and imageUrl are required" }, { status: 400 })
    }
    if (!["header_slider", "footer"].includes(placement)) {
      return NextResponse.json({ error: "placement must be 'header_slider' or 'footer'" }, { status: 400 })
    }

    const id = randomUUID()
    await d1Query(
      `INSERT INTO banners (id, placement, title, image_url, link_url, sort_order, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, placement, title ?? null, imageUrl, linkUrl ?? null, sortOrder ?? 0, startsAt ?? null, endsAt ?? null, auth.uid],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create banner" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { id, title, imageUrl, linkUrl, sortOrder, isActive, startsAt, endsAt } = await req.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const sets: string[] = []
    const values: unknown[] = []

    if (title !== undefined) { sets.push("title = ?"); values.push(title) }
    if (imageUrl !== undefined) { sets.push("image_url = ?"); values.push(imageUrl) }
    if (linkUrl !== undefined) { sets.push("link_url = ?"); values.push(linkUrl) }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); values.push(sortOrder) }
    if (isActive !== undefined) { sets.push("is_active = ?"); values.push(isActive ? 1 : 0) }
    if (startsAt !== undefined) { sets.push("starts_at = ?"); values.push(startsAt) }
    if (endsAt !== undefined) { sets.push("ends_at = ?"); values.push(endsAt) }

    if (sets.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })

    sets.push("updated_at = datetime('now')")
    values.push(id)

    await d1Query(`UPDATE banners SET ${sets.join(", ")} WHERE id = ?`, values)
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

  await d1Query("DELETE FROM banners WHERE id = ?", [id])
  return NextResponse.json({ success: true })
}
