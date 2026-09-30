// app/api/admin/blog-comments/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { setCommentStatus, deleteComment } from "@/src/services/blogComments"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  try {
    const { status } = await req.json()
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 })
    }
    await setCommentStatus(id, status)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  await deleteComment(id)
  return NextResponse.json({ success: true })
}
