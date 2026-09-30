// app/api/admin/blog-authors/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { updateAuthor, deleteAuthor } from "@/src/services/blogAuthors"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  try {
    const body = await req.json()
    const { name, bio, photoUrl, isActive } = body
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const author = await updateAuthor(id, { name, bio, photoUrl, isActive })
    return NextResponse.json({ success: true, author })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  await deleteAuthor(id)
  return NextResponse.json({ success: true })
}
