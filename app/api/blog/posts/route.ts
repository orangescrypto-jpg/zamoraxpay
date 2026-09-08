// app/api/blog/posts/route.ts
import { NextRequest, NextResponse } from "next/server"
import { listPublishedPosts } from "@/src/services/blog"

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? undefined
  const posts = await listPublishedPosts(category)
  return NextResponse.json({ posts })
}
