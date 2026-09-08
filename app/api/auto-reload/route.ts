// app/api/auto-reload/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { isFeatureEnabled } from "@/src/services/config"

function computeNextRun(frequency: string): string {
  const now = new Date()
  if (frequency === "daily") now.setDate(now.getDate() + 1)
  else if (frequency === "weekly") now.setDate(now.getDate() + 7)
  else if (frequency === "monthly") now.setMonth(now.getMonth() + 1)
  return now.toISOString()
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const result = await d1Query(
    `SELECT r.*, b.recipient, b.network_or_biller, b.nickname FROM auto_reload_rules r
     JOIN beneficiaries b ON b.id = r.beneficiary_id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`,
    [auth.uid],
  )
  return NextResponse.json({ rules: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  if (!(await isFeatureEnabled("auto_reload"))) {
    return NextResponse.json({ error: "Auto-reload is currently unavailable" }, { status: 503 })
  }

  try {
    const { beneficiaryId, serviceType, planCode, amountKobo, frequency } = await req.json()
    if (!beneficiaryId || !serviceType || !amountKobo || !frequency) {
      return NextResponse.json(
        { error: "beneficiaryId, serviceType, amountKobo, and frequency are required" },
        { status: 400 },
      )
    }
    if (!["daily", "weekly", "monthly"].includes(frequency)) {
      return NextResponse.json({ error: "frequency must be daily, weekly, or monthly" }, { status: 400 })
    }

    const id = randomUUID()
    await d1Query(
      `INSERT INTO auto_reload_rules (id, user_id, beneficiary_id, service_type, plan_code, amount_kobo, frequency, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, auth.uid, beneficiaryId, serviceType, planCode ?? null, amountKobo, frequency, computeNextRun(frequency)],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create rule" }, { status: 500 })
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

    await d1Query(
      "UPDATE auto_reload_rules SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
      [isActive ? 1 : 0, id, auth.uid],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

  await d1Query("DELETE FROM auto_reload_rules WHERE id = ? AND user_id = ?", [id, auth.uid])
  return NextResponse.json({ success: true })
}
