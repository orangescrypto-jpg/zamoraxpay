// app/api/contact-batches/route.ts
// CRUD for saved contact batches (named groups of phone numbers),
// used by the bulk airtime/data purchase flow.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import {
  createContactBatch,
  listContactBatches,
  deleteContactBatch,
  parseNumbersInput,
} from "@/src/services/contactBatches"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const batches = await listContactBatches(auth.uid)
  return NextResponse.json({ batches })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { name, numbersText } = await req.json()
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    if (!numbersText || typeof numbersText !== "string") {
      return NextResponse.json({ error: "numbersText is required" }, { status: 400 })
    }

    const parsed = parseNumbersInput(numbersText)
    if (parsed.valid.length === 0) {
      return NextResponse.json(
        { error: "No valid Nigerian numbers found. Numbers must be 11 digits starting with 070, 080, or 090." },
        { status: 400 },
      )
    }

    const result = await createContactBatch(auth.uid, name, parsed.valid)
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      savedCount: parsed.valid.length,
      invalidEntries: parsed.invalid,
      duplicatesRemoved: parsed.duplicatesRemoved,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create group" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

  await deleteContactBatch(auth.uid, id)
  return NextResponse.json({ success: true })
}
