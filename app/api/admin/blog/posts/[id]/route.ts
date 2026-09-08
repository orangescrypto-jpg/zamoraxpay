// app/api/admin/blog/posts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { updatePost, deletePost } from "@/src/services/blog"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  try {
    const updates = await req.json()
    await updatePost(id, updates)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  await deletePost(id)
  return NextResponse.json({ success: true })
}
