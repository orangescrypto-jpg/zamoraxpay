// app/api/admin/blog/posts/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { listAllPostsAdmin, createPost } from "@/src/services/blog"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const posts = await listAllPostsAdmin()
  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { slug, title, excerpt, contentMarkdown, coverImageUrl, category, authorName, metaDescription, status } = body

    if (!slug || !title || !contentMarkdown) {
      return NextResponse.json({ error: "slug, title, and contentMarkdown are required" }, { status: 400 })
    }

    const id = await createPost(
      {
        slug,
        title,
        excerpt,
        contentMarkdown,
        coverImageUrl,
        category,
        authorName,
        metaDescription,
        status: status === "published" ? "published" : "draft",
      },
      auth.uid,
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create post" }, { status: 500 })
  }
}
