// app/api/blog/latest/route.ts
// Returns the latest published posts, capped at whatever count the
// admin has configured for the homepage (site_settings.homepage_post_count).
// This keeps the "how many posts on the homepage" decision in one
// place (the admin setting) rather than duplicated in every caller.

import { NextResponse } from "next/server"
import { listPublishedPosts } from "@/src/services/blog"
import { getSettingNumber } from "@/src/services/siteSettings"

export async function GET() {
  const count = await getSettingNumber("homepage_post_count", 6)
  const posts = await listPublishedPosts()
  return NextResponse.json({ posts: posts.slice(0, count) })
}
