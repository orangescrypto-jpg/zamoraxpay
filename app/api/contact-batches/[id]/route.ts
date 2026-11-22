// // app/api/contact-batches/[id]/route.ts
// Fetches a single contact batch with its full number list — used
// when the bulk purchase page needs to show/confirm which numbers
// are in a selected group before running the purchase.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import {
  getContactBatch,
  renameContactBatch,
  replaceContactBatchNumbers,
  parseNumbersInput,
} from "@/src/services/contactBatches"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  const batch = await getContactBatch(auth.uid, id)
  if (!batch) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  return NextResponse.json({ batch })
}

// Edits an existing group: rename (name) and/or replace its whole
// number list (numbersText, parsed the same way as group creation).
// Either field can be sent alone — e.g. renaming without touching
// numbers, or re-pasting numbers without renaming.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const { id } = await params
  const existing = await getContactBatch(auth.uid, id)
  if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  try {
    const { name, numbersText } = await req.json()

    if (typeof name === "string" && name.trim()) {
      const renameResult = await renameContactBatch(auth.uid, id, name)
      if (!renameResult.success) {
        return NextResponse.json({ error: renameResult.message }, { status: 400 })
      }
    }

    let savedCount: number | undefined
    let invalidEntries: string[] | undefined
    let duplicatesRemoved: number | undefined

    if (typeof numbersText === "string" && numbersText.trim()) {
      const parsed = parseNumbersInput(numbersText)
      if (parsed.valid.length === 0) {
        return NextResponse.json(
          { error: "No valid Nigerian numbers found. Numbers must be 11 digits starting with 070, 080, or 090." },
          { status: 400 },
        )
      }
      const replaceResult = await replaceContactBatchNumbers(auth.uid, id, parsed.valid)
      if (!replaceResult.success) {
        return NextResponse.json({ error: replaceResult.message }, { status: 400 })
      }
      savedCount = parsed.valid.length
      invalidEntries = parsed.invalid
      duplicatesRemoved = parsed.duplicatesRemoved
    }

    return NextResponse.json({ success: true, savedCount, invalidEntries, duplicatesRemoved })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update group" }, { status: 500 })
  }
}
