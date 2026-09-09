// // app/api/contact-batches/[id]/route.ts
// Fetches a single contact batch with its full number list — used
// when the bulk purchase page needs to show/confirm which numbers
// are in a selected group before running the purchase.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getContactBatch } from "@/src/services/contactBatches"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  const batch = await getContactBatch(auth.uid, id)
  if (!batch) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  return NextResponse.json({ batch })
}
