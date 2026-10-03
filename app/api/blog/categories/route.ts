// app/api/blog/categories/route.ts
import { NextResponse } from "next/server"
import { d1Query } from "@/lib/db"

// Renders per request: reads D1 at runtime, not at build time.
export const dynamic = "force-dynamic"

export async function GET() {
  const result = await d1Query("SELECT * FROM blog_categories ORDER BY sort_order")
  return NextResponse.json({ categories: result.results ?? [] })
}
