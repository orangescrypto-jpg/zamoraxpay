// src/services/contactBatches.ts
// Service abstraction layer — saved contact batches for bulk purchase.
//
// A batch is just a named list of phone numbers a user saves once
// (see "Create Groups" flow) and reuses across multiple bulk airtime
// / bulk data runs, instead of re-pasting numbers every time.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import { normalizeNgPhone, isValidNgPhone } from "@/lib/networkDetect"

export interface ContactBatchNumber {
  phone: string
  label?: string | null
}

export interface ContactBatch {
  id: string
  name: string
  createdAt: string
  numbers: ContactBatchNumber[]
}

export interface ContactBatchSummary {
  id: string
  name: string
  numberCount: number
  createdAt: string
}

const MAX_NUMBERS_PER_BATCH = 100

export interface ParsedNumbersResult {
  valid: string[]       // normalized, deduped, in original order
  invalid: string[]      // entries that didn't look like a valid NG number
  duplicatesRemoved: number
}

// Splits on commas, whitespace (spaces/tabs), and newlines — matches
// the placeholder text shown in the Create Groups UI ("Separate by
// commas, spaces, or new lines").
export function parseNumbersInput(raw: string): ParsedNumbersResult {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  let duplicatesRemoved = 0

  for (const token of tokens) {
    const normalized = normalizeNgPhone(token)
    if (!isValidNgPhone(normalized)) {
      invalid.push(token)
      continue
    }
    if (seen.has(normalized)) {
      duplicatesRemoved++
      continue
    }
    seen.add(normalized)
    valid.push(normalized)
  }

  return { valid, invalid, duplicatesRemoved }
}

export async function createContactBatch(
  userId: string,
  name: string,
  numbers: string[],
): Promise<{ success: boolean; id?: string; message?: string }> {
  if (!name.trim()) return { success: false, message: "Group name is required" }
  if (numbers.length === 0) return { success: false, message: "At least one valid number is required" }
  if (numbers.length > MAX_NUMBERS_PER_BATCH) {
    return { success: false, message: `Max ${MAX_NUMBERS_PER_BATCH} numbers per group` }
  }

  const batchId = randomUUID()
  await d1Query("INSERT INTO contact_batches (id, user_id, name) VALUES (?, ?, ?)", [batchId, userId, name.trim()])

  // D1 has no multi-row INSERT helper here, so insert sequentially.
  // Batches are capped at 100 numbers, so this stays fast enough for
  // a single request.
  for (let i = 0; i < numbers.length; i++) {
    await d1Query(
      "INSERT INTO contact_batch_numbers (id, batch_id, phone, sort_order) VALUES (?, ?, ?, ?)",
      [randomUUID(), batchId, numbers[i], i],
    )
  }

  return { success: true, id: batchId }
}

export async function listContactBatches(userId: string): Promise<ContactBatchSummary[]> {
  const result = await d1Query(
    `SELECT cb.id, cb.name, cb.created_at, COUNT(cbn.id) as number_count
     FROM contact_batches cb
     LEFT JOIN contact_batch_numbers cbn ON cbn.batch_id = cb.id
     WHERE cb.user_id = ?
     GROUP BY cb.id
     ORDER BY cb.created_at DESC`,
    [userId],
  )
  return (result.results ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    numberCount: row.number_count ?? 0,
    createdAt: row.created_at,
  }))
}

export async function getContactBatch(userId: string, batchId: string): Promise<ContactBatch | null> {
  const batchResult = await d1Query(
    "SELECT id, name, created_at FROM contact_batches WHERE id = ? AND user_id = ?",
    [batchId, userId],
  )
  const batch = batchResult.results?.[0]
  if (!batch) return null

  const numbersResult = await d1Query(
    "SELECT phone, label FROM contact_batch_numbers WHERE batch_id = ? ORDER BY sort_order ASC",
    [batchId],
  )

  return {
    id: batch.id as string,
    name: batch.name as string,
    createdAt: batch.created_at as string,
    numbers: (numbersResult.results ?? []).map((r: any) => ({ phone: r.phone, label: r.label })),
  }
}

export async function deleteContactBatch(userId: string, batchId: string): Promise<void> {
  // Ownership check happens implicitly — the DELETE only affects rows
  // where user_id matches, so a batch ID belonging to another user is
  // silently a no-op rather than an error (avoids leaking existence).
  await d1Query("DELETE FROM contact_batch_numbers WHERE batch_id = (SELECT id FROM contact_batches WHERE id = ? AND user_id = ?)", [batchId, userId])
  await d1Query("DELETE FROM contact_batches WHERE id = ? AND user_id = ?", [batchId, userId])
}
