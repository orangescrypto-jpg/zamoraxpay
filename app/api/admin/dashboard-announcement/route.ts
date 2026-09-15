// app/api/admin/dashboard-announcement/route.ts
// Admin CRUD for the dashboard announcement system. Two display
// styles share one table: 'banner' (the original strip shown between
// wallet balance and Quick actions) and 'popup' (a modal shown once
// per session, once-ever per browser if show_once is set, or on every
// dashboard load/refresh if show_always is set — see
// DashboardPopupAnnouncement.tsx). show_always overrides show_once
// when both are set. Text and image are both optional
// independently — admin can use one, the other, or both — but at
// least one is required so there's something to render. Link is
// always optional; when absent the item renders as plain
// non-clickable text/image. audience filters which users see it:
// 'all' | 'retail' | 'reseller' (matches users.tier exactly — there
// is no 'user' tier in this codebase).
//
// Image upload is a separate concern: the admin UI uploads to R2 via
// the existing /api/admin/upload route first, then calls this route
// with the resulting URL.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

const VALID_DISPLAY_STYLES = new Set(["banner", "popup"])
const VALID_AUDIENCES = new Set(["all", "retail", "reseller"])

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
    const {
      text,
      imageUrl,
      linkUrl,
      sortOrder,
      startsAt,
      endsAt,
      displayStyle,
      backgroundColor,
      audience,
      showOnce,
      showAlways,
    } = await req.json()

    if (!text && !imageUrl) {
      return NextResponse.json({ error: "Provide text, an image, or both" }, { status: 400 })
    }

    const style = displayStyle ?? "banner"
    if (!VALID_DISPLAY_STYLES.has(style)) {
      return NextResponse.json({ error: "displayStyle must be 'banner' or 'popup'" }, { status: 400 })
    }

    const targetAudience = audience ?? "all"
    if (!VALID_AUDIENCES.has(targetAudience)) {
      return NextResponse.json({ error: "audience must be 'all', 'retail', or 'reseller'" }, { status: 400 })
    }

    const id = randomUUID()
    // showAlways takes priority over showOnce when both are somehow set —
    // "always show on every dashboard load" is a stronger guarantee than
    // "show once ever", so a conflicting showOnce is ignored in that case.
    const resolvedShowAlways = showAlways ? 1 : 0
    const resolvedShowOnce = resolvedShowAlways ? 0 : showOnce ? 1 : 0
    await d1Query(
      `INSERT INTO dashboard_announcements
         (id, text, image_url, link_url, sort_order, starts_at, ends_at, created_by,
          display_style, background_color, audience, show_once, show_always)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        text ?? null,
        imageUrl ?? null,
        linkUrl ?? null,
        sortOrder ?? 0,
        startsAt ?? null,
        endsAt ?? null,
        auth.uid,
        style,
        backgroundColor ?? null,
        targetAudience,
        resolvedShowOnce,
        resolvedShowAlways,
      ],
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
    const {
      id,
      text,
      imageUrl,
      linkUrl,
      sortOrder,
      isActive,
      startsAt,
      endsAt,
      displayStyle,
      backgroundColor,
      audience,
      showOnce,
      showAlways,
    } = await req.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    if (displayStyle !== undefined && !VALID_DISPLAY_STYLES.has(displayStyle)) {
      return NextResponse.json({ error: "displayStyle must be 'banner' or 'popup'" }, { status: 400 })
    }
    if (audience !== undefined && !VALID_AUDIENCES.has(audience)) {
      return NextResponse.json({ error: "audience must be 'all', 'retail', or 'reseller'" }, { status: 400 })
    }

    const sets: string[] = []
    const values: unknown[] = []

    if (text !== undefined) { sets.push("text = ?"); values.push(text) }
    if (imageUrl !== undefined) { sets.push("image_url = ?"); values.push(imageUrl) }
    if (linkUrl !== undefined) { sets.push("link_url = ?"); values.push(linkUrl) }
    if (sortOrder !== undefined) { sets.push("sort_order = ?"); values.push(sortOrder) }
    if (isActive !== undefined) { sets.push("is_active = ?"); values.push(isActive ? 1 : 0) }
    if (startsAt !== undefined) { sets.push("starts_at = ?"); values.push(startsAt) }
    if (endsAt !== undefined) { sets.push("ends_at = ?"); values.push(endsAt) }
    if (displayStyle !== undefined) { sets.push("display_style = ?"); values.push(displayStyle) }
    if (backgroundColor !== undefined) { sets.push("background_color = ?"); values.push(backgroundColor) }
    if (audience !== undefined) { sets.push("audience = ?"); values.push(audience) }
    // showAlways wins over showOnce if both arrive in the same request —
    // see the same note in POST.
    if (showAlways !== undefined) {
      sets.push("show_always = ?")
      values.push(showAlways ? 1 : 0)
      if (showAlways) { sets.push("show_once = ?"); values.push(0) }
    }
    if (showOnce !== undefined && showAlways === undefined) {
      sets.push("show_once = ?")
      values.push(showOnce ? 1 : 0)
    }

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
