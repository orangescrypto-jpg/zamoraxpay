// lib/auth-server.ts
// Server-side auth helpers for API routes.
// Verifies Supabase session from cookies (or bearer token), checks
// admin_users table for elevated access.

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { d1Query } from "@/lib/d1"

function buildSupabaseFromRequest(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll() {
          // Read-only in API route context — session refresh handled by middleware
        },
      },
    },
  )
}

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization")
  const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null

  const supabase = buildSupabaseFromRequest(req)

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken)
    if (!error && data.user) return { user: data.user, error: null }
  }

  const { data, error } = await supabase.auth.getUser()
  return { user: data.user, error }
}

async function getAdminRole(uid: string, nativeDB?: unknown): Promise<string | null> {
  try {
    const result = await d1Query("SELECT role FROM admin_users WHERE id = ? LIMIT 1", [uid], nativeDB)
    const rows = (result as any)?.results ?? []
    return rows[0]?.role ?? null
  } catch {
    return null
  }
}

async function getUserStatus(uid: string, nativeDB?: unknown): Promise<string | null> {
  try {
    const result = await d1Query("SELECT status FROM users WHERE id = ? LIMIT 1", [uid], nativeDB)
    const rows = (result as any)?.results ?? []
    return rows[0]?.status ?? null
  } catch {
    return null
  }
}

type AuthResult =
  | { ok: true; uid: string; role: string | null; error: null }
  | { ok: false; uid: null; role: null; error: NextResponse }

const ROLE_RANK: Record<string, number> = {
  moderator: 1,
  admin: 2,
  super_admin: 3,
}

/** Requires a valid, non-suspended/frozen ZamoraxPay customer session. */
export async function requireAuth(req: NextRequest, nativeDB?: unknown): Promise<AuthResult> {
  const { user, error } = await getUserFromRequest(req)

  if (error || !user) {
    return { ok: false, uid: null, role: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const status = await getUserStatus(user.id, nativeDB)
  if (status === "suspended" || status === "frozen") {
    return {
      ok: false,
      uid: null,
      role: null,
      error: NextResponse.json({ error: "Account is suspended. Contact support." }, { status: 403 }),
    }
  }

  return { ok: true, uid: user.id, role: null, error: null }
}

/**
 * Requires the caller to be listed in admin_users with ANY staff role
 * (moderator, admin, or super_admin) — the floor for anything in the
 * admin panel at all. Use this for routes moderators are allowed to
 * touch (users list/detail, suspend/reactivate, fraud review,
 * transaction/order viewing). For anything moderators should NOT
 * touch (pricing, provider credentials, banners, pages, blog, feature
 * flags, permanent delete), use requireAdmin or requireSuperAdmin
 * instead — those explicitly exclude moderator.
 */
export async function requireStaff(req: NextRequest, nativeDB?: unknown): Promise<AuthResult> {
  const { user, error } = await getUserFromRequest(req)

  if (error || !user) {
    return { ok: false, uid: null, role: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const role = await getAdminRole(user.id, nativeDB)
  if (!role || !(role in ROLE_RANK)) {
    return { ok: false, uid: null, role: null, error: NextResponse.json({ error: "Staff access required" }, { status: 401 }) }
  }

  return { ok: true, uid: user.id, role, error: null }
}

/**
 * Requires 'admin' or 'super_admin' specifically — excludes moderator.
 * Use this for routes that change site configuration: feature flags,
 * pricing, banners, site pages, blog, and user status changes.
 */
export async function requireAdmin(req: NextRequest, nativeDB?: unknown): Promise<AuthResult> {
  const { user, error } = await getUserFromRequest(req)

  if (error || !user) {
    return { ok: false, uid: null, role: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const role = await getAdminRole(user.id, nativeDB)
  if (!role || (ROLE_RANK[role] ?? 0) < ROLE_RANK.admin) {
    return { ok: false, uid: null, role: null, error: NextResponse.json({ error: "Admin access required" }, { status: 401 }) }
  }

  return { ok: true, uid: user.id, role, error: null }
}

/** Requires super_admin specifically (for sensitive actions like provider credentials, permanent delete). */
export async function requireSuperAdmin(req: NextRequest, nativeDB?: unknown): Promise<AuthResult> {
  const result = await requireAdmin(req, nativeDB)
  if (!result.ok) return result
  if (result.role !== "super_admin") {
    return {
      ok: false,
      uid: null,
      role: null,
      error: NextResponse.json({ error: "Super admin access required" }, { status: 403 }),
    }
  }
  return result
}
