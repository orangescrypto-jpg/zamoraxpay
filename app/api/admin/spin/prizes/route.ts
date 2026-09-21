// app/api/admin/spin/prizes/route.ts
// Add, edit and PERMANENTLY delete prizes on a source's wheel.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { SpinAdminError, deletePrize, savePrize } from "@/src/services/spinAdmin"

// POST — create (no id) or update (with id) a prize.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error
  try {
    const result = await savePrize(await req.json(), auth.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: err instanceof SpinAdminError ? 400 : 500 })
  }
}

// DELETE — permanently remove a prize. Body: { id }. Past wins are unaffected.
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error
  try {
    const body = await req.json().catch(() => ({}))
    if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deletePrize(String(body.id), auth.uid)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: err instanceof SpinAdminError ? 400 : 500 })
  }
}
