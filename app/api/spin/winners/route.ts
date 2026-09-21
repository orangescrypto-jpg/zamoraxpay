// app/api/spin/winners/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getRecentWinners } from "@/src/services/spinEngine"

// GET — recent winners for the "A user just won ₦500" ticker. Names are masked server-side;
// returns an empty list when the admin has turned the winner feed off.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error
  try {
    return NextResponse.json({ winners: await getRecentWinners() })
  } catch {
    return NextResponse.json({ winners: [] })
  }
}
