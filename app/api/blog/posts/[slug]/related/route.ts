// app/api/blog/posts/[slug]/related/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getPostBySlug, getRelatedPosts } from "@/src/services/blog"
import { getSettingNumber } from "@/src/services/siteSettings"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

  const count = await getSettingNumber("related_post_count", 4)
  const related = await getRelatedPosts(post, count)

  return NextResponse.json({ posts: related })
}
