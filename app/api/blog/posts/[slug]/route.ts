// app/api/blog/posts/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getPostBySlug } from "@/src/services/blog"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })
  return NextResponse.json({ post })
}
