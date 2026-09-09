// app/api/admin/daily-streak/tiers/route.ts
// Admin CRUD for daily_streak_tiers. Same pattern as
// app/api/admin/settings/route.ts and app/api/admin/weekend-bonus/route.ts:
// GET lists, POST creates/updates (upsert keyed on optional id), DELETE removes.
// Every write is logged to admin_audit_log, matching weekend-bonus's manual-run pattern.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { listStreakTiers, upsertStreakTier, deleteStreakTier } from "@/src/services/dailyStreak"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const tiers = await listStreakTiers()
  return NextResponse.json({ tiers })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { id, dayFrom, dayTo, baseAmountKobo, stepAmountKobo } = body ?? {}

    if (dayFrom === undefined || baseAmountKobo === undefined) {
      return NextResponse.json({ error: "dayFrom and baseAmountKobo are required" }, { status: 400 })
    }
    if (dayTo !== null && dayTo !== undefined && Number(dayTo) < Number(dayFrom)) {
      return NextResponse.json({ error: "dayTo cannot be less than dayFrom" }, { status: 400 })
    }

    const params = {
      id: id || undefined,
      dayFrom: Number(dayFrom),
      dayTo: dayTo === null || dayTo === undefined || dayTo === "" ? null : Number(dayTo),
      baseAmountKobo: Number(baseAmountKobo),
      stepAmountKobo: Number(stepAmountKobo ?? 0),
    }

    await upsertStreakTier(params, auth.uid)

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, ?, 'daily_streak_tiers', ?, NULL, ?)`,
      [randomUUID(), auth.uid, id ? "daily_streak_tier.update" : "daily_streak_tier.create", id ?? null, JSON.stringify(params)],
    )

    const tiers = await listStreakTiers()
    return NextResponse.json({ success: true, tiers })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    await deleteStreakTier(id)

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 'daily_streak_tier.delete', 'daily_streak_tiers', ?, NULL, NULL)`,
      [randomUUID(), auth.uid, id],
    )

    const tiers = await listStreakTiers()
    return NextResponse.json({ success: true, tiers })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 })
  }
}
