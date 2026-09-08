// app/api/admin/me/route.ts
// Lets the admin panel UI ask "what role am I logged in as" so it can
// hide navigation links the current user has no access to. The actual
// security boundary is still each route's own requireStaff/requireAdmin/
// requireSuperAdmin check — this route only controls what's SHOWN, not
// what's allowed, so hiding a link here is a UX nicety, not a permission.

import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  return NextResponse.json({ role: auth.role })
}
