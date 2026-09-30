// app/api/admin/blog-authors/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { listAuthors, createAuthor } from "@/src/services/blogAuthors"

// Authors (byline library) — admin AND moderator can manage these,
// unlike most other /admin/blog* config which is admin-only.
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const authors = await listAuthors()
  return NextResponse.json({ authors })
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { name, bio, photoUrl, isActive } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const author = await createAuthor({ name, bio, photoUrl, isActive }, auth.uid)
    return NextResponse.json({ success: true, author })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create author" }, { status: 500 })
  }
}
