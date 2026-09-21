// app/api/spin/history/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getSpinHistory } from "@/src/services/spinEngine"

// GET — the user's own spin history (newest first).
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error
  try {
    return NextResponse.json({ history: await getSpinHistory(auth.uid, 50) })
  } catch {
    return NextResponse.json({ history: [] })
  }
}
