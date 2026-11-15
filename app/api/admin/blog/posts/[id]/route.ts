// app/api/admin/blog/posts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requireStaff } from "@/lib/auth-server"
import { updatePost, deletePost, getPostById } from "@/src/services/blog"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  try {
    const updates = await req.json()
    const before = await getPostById(id)
    await updatePost(id, updates)
    // ISR purge (audit finding: admin edits did not revalidate): purge
    // the post's own cached route (when it was or is now published),
    // the blog list, and the homepage's featured-posts section.
    revalidatePath("/blog")
    revalidatePath("/")
    if (before?.slug) revalidatePath(`/blog/${before.slug}`)
    if (typeof updates.slug === "string" && updates.slug !== before?.slug) {
      revalidatePath(`/blog/${updates.slug}`)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  const before = await getPostById(id)
  await deletePost(id)
  // ISR purge for deletions too — a deleted post's cached page and the
  // list/home entries must not linger for up to an hour.
  revalidatePath("/blog")
  revalidatePath("/")
  if (before?.slug) revalidatePath(`/blog/${before.slug}`)
  return NextResponse.json({ success: true })
}
