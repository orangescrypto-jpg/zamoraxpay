// app/api/history/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getOrderHistory } from "@/src/services/vtuOrders"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const orders = await getOrderHistory(auth.uid)
  return NextResponse.json({ orders })
}
