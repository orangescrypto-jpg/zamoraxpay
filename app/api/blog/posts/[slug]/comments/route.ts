// app/api/blog/posts/[slug]/comments/route.ts
// Public: read approved comments on a post, and submit a new one.
// Deliberately account-free — just a display name + comment text.
// New comments are held 'pending' until an admin/moderator approves them.
import { NextRequest, NextResponse } from "next/server"
import { getPostBySlug } from "@/src/services/blog"
import { listApprovedComments, createComment } from "@/src/services/blogComments"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  const comments = await listApprovedComments(post.id)
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  try {
    const body = await req.json()
    const { name, comment } = body
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (!comment || !String(comment).trim()) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 })
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

    await createComment({ postId: post.id, name, comment, ipAddress: ip ?? undefined })

    return NextResponse.json({
      success: true,
      message: "Thanks! Your comment will appear once it's reviewed.",
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to submit comment" }, { status: 500 })
  }
}
