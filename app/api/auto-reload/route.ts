// app/api/auto-reload/route.ts
// USER-FACING CRUD API for scheduled-bill rules (auto_reload_rules).
//
// SECURITY FIX (audit finding): this route previously exposed a GET that
// EXECUTED all due rules (wallet debits + VTU purchases) and failed OPEN
// when CRON_SECRET was unset — any visitor could trigger money movement.
// Execution now lives ONLY in /api/cron/auto-reload, which is fail-closed
// via verifyCronAuth(). This route is strictly a user-scoped CRUD surface:
//
//   GET    /api/auto-reload            -> list the caller's rules
//   POST   /api/auto-reload            -> create a rule (from a purchase page)
//   PATCH  /api/auto-reload            -> pause/resume a rule (is_active)
//   DELETE /api/auto-reload?id=<uuid>  -> cancel a rule
//
// Every statement is scoped by requireAuth()'s uid — a user can only ever
// see or mutate their own rules. The scheduled-bills UI previously called
// PATCH/DELETE on this path and got 405s (the route only exported GET);
// those methods now exist and the page works end to end.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly"])
const VALID_SERVICE_TYPES = new Set(["airtime", "data", "electricity", "cable", "betting"])

function computeNextRun(frequency: string, from: Date): string {
  const next = new Date(from)
  if (frequency === "daily") next.setDate(next.getDate() + 1)
  else if (frequency === "weekly") next.setDate(next.getDate() + 7)
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1)
  return next.toISOString()
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const result = await d1Query(
    `SELECT r.id, r.service_type, r.plan_code, r.amount_kobo, r.frequency,
            r.next_run_at, r.is_active, b.recipient, b.network_or_biller, b.nickname
     FROM auto_reload_rules r
     JOIN beneficiaries b ON b.id = r.beneficiary_id
     WHERE r.user_id = ?
     ORDER BY r.next_run_at ASC`,
    [auth.uid],
  )
  return NextResponse.json({ rules: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { beneficiaryId, serviceType, planCode, amountKobo, frequency } = body ?? {}

    if (!beneficiaryId || !serviceType || !amountKobo || !frequency) {
      return NextResponse.json(
        { error: "beneficiaryId, serviceType, amountKobo, and frequency are required" },
        { status: 400 },
      )
    }
    if (!VALID_FREQUENCIES.has(frequency)) {
      return NextResponse.json({ error: "frequency must be daily, weekly, or monthly" }, { status: 400 })
    }
    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json({ error: "Unsupported service type" }, { status: 400 })
    }
    const amount = Number(amountKobo)
    if (!Number.isFinite(amount) || amount < 5000) {
      // ₦50 floor — matches the smallest purchasable amount in the app
      return NextResponse.json({ error: "amountKobo must be at least 5000 (₦50)" }, { status: 400 })
    }

    // The beneficiary must belong to the caller (this doubles as the
    // recipient/network source of truth, so the rule can't be pointed at
    // another user's saved beneficiary).
    const beneficiary = await d1Query(
      "SELECT id FROM beneficiaries WHERE id = ? AND user_id = ? LIMIT 1",
      [beneficiaryId, auth.uid],
    )
    if (!beneficiary.results?.length) {
      return NextResponse.json({ error: "Beneficiary not found" }, { status: 404 })
    }

    const id = randomUUID()
    await d1Query(
      `INSERT INTO auto_reload_rules
         (id, user_id, beneficiary_id, service_type, plan_code, amount_kobo, frequency, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        auth.uid,
        beneficiaryId,
        serviceType,
        planCode ?? null,
        Math.round(amount),
        frequency,
        computeNextRun(frequency, new Date()),
      ],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create scheduled payment" },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { id, isActive } = await req.json()
    if (!id || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "id and isActive (boolean) are required" }, { status: 400 })
    }

    const result = await d1Query(
      "UPDATE auto_reload_rules SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
      [isActive ? 1 : 0, id, auth.uid],
    )
    const meta = (result as { meta?: { changes?: number; rows_written?: number } })?.meta
    const changed = meta?.changes ?? meta?.rows_written
    if (changed === 0) {
      return NextResponse.json({ error: "Scheduled payment not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update scheduled payment" },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

  const result = await d1Query("DELETE FROM auto_reload_rules WHERE id = ? AND user_id = ?", [id, auth.uid])
  const meta = (result as { meta?: { changes?: number; rows_written?: number } })?.meta
  const changed = meta?.changes ?? meta?.rows_written
  if (changed === 0) {
    return NextResponse.json({ error: "Scheduled payment not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
