// app/api/admin/blog-comments/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-server"
import { listAllCommentsAdmin } from "@/src/services/blogComments"

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (!auth.ok) return auth.error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || undefined

  const comments = await listAllCommentsAdmin(status)
  return NextResponse.json({ comments })
}
