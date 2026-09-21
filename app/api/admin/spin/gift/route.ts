// app/api/admin/spin/gift/route.ts
// Send spin tickets by hand: one user, a whole tier, or everyone.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { SpinAdminError, giftTickets } from "@/src/services/spinAdmin"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error
  try {
    const result = await giftTickets(await req.json(), auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gift failed" }, { status: err instanceof SpinAdminError ? 400 : 500 })
  }
}
