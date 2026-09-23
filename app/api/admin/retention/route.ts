// app/api/admin/retention/route.ts
// Admin control for data retention.
//
//   GET    -> every job with its current days, safe minimum, how many rows
//             are due for deletion right now, and its last run
//   PATCH  -> save retention days / the master switch / batch + time budget
//   POST   -> { jobKey } deletes that ONE job's due rows now
//             { all: true } runs every job now
//
// POST is destructive and cannot be undone (wallet and audit rows are
// copied to R2 first; everything else is gone for good), so it requires
// the caller to send confirm: true. The admin page shows a confirmation
// dialog and sends it; a bare request without it is rejected.
//
// All writes are recorded in admin_audit_log. Note that log is itself
// pruned by the audit_log job, after being copied to R2.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getSettingNumber, updateSetting } from "@/src/services/siteSettings"
import {
  RETENTION_JOBS,
  getJobDef,
  getRetentionOverview,
  runAllRetentionJobs,
  runOneRetentionJobNow,
  type RetentionJobKey,
} from "@/src/services/retention"

export const runtime = "nodejs"
export const maxDuration = 60

async function audit(adminId: string, action: string, targetId: string | null, before: unknown, after: unknown) {
  try {
    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, ?, 'site_settings', ?, ?, ?)`,
      [randomUUID(), adminId, action, targetId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)],
    )
  } catch (err) {
    // An audit failure must never block the admin's action, but it must be visible in server logs.
    console.error("[admin/retention] audit log write failed:", err)
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const [overview, batch, budget] = await Promise.all([
      getRetentionOverview(),
      getSettingNumber("retention_batch_size", 1000),
      getSettingNumber("retention_time_budget_seconds", 40),
    ])

    const recent = await d1Query(
      `SELECT job_key, trigger_source, rows_affected, status, message, started_at
         FROM retention_runs ORDER BY started_at DESC LIMIT 30`,
    )

    return NextResponse.json({
      masterEnabled: overview.masterEnabled,
      batchSize: batch,
      timeBudgetSeconds: budget,
      jobs: overview.jobs,
      recentRuns: recent.results ?? [],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load retention" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json().catch(() => ({}))

    // ── master switch ──
    if (typeof body.masterEnabled === "boolean") {
      await updateSetting("retention_enabled", body.masterEnabled ? "true" : "false", auth.uid)
      await audit(auth.uid, "retention.master_switch", "retention_enabled", null, { enabled: body.masterEnabled })
      return NextResponse.json({ success: true })
    }

    // ── batch size / time budget ──
    if (body.setting === "batchSize" || body.setting === "timeBudgetSeconds") {
      const n = Math.floor(Number(body.value))
      const [key, min, max] =
        body.setting === "batchSize" ? (["retention_batch_size", 100, 5000] as const) : (["retention_time_budget_seconds", 5, 300] as const)
      if (!Number.isFinite(n) || n < min || n > max) {
        return NextResponse.json({ error: `Value must be a whole number between ${min} and ${max}` }, { status: 400 })
      }
      await updateSetting(key, String(n), auth.uid)
      await audit(auth.uid, "retention.setting", key, null, { value: n })
      return NextResponse.json({ success: true })
    }

    // ── one job's retention days ──
    const def = getJobDef(String(body.jobKey ?? ""))
    if (!def) return NextResponse.json({ error: "Unknown job" }, { status: 400 })

    const days = Number(body.days)
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      return NextResponse.json({ error: "Days must be a whole number from 0 to 3650 (0 turns this job off)" }, { status: 400 })
    }
    // Refuse rather than silently raising the number: the admin should SEE that their value was rejected.
    if (days !== 0 && days < def.minDays) {
      return NextResponse.json({ error: `"${def.label}" cannot be lower than ${def.minDays} days — live features read that far back.` }, { status: 400 })
    }

    const before = await getSettingNumber(def.settingKey, def.defaultDays)
    await updateSetting(def.settingKey, String(days), auth.uid)
    await audit(auth.uid, "retention.days_changed", def.settingKey, { days: before }, { days })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json().catch(() => ({}))

    if (body.confirm !== true) {
      return NextResponse.json({ error: "Confirmation required. This permanently deletes data." }, { status: 400 })
    }

    if (body.all === true) {
      const out = await runAllRetentionJobs("admin")
      await audit(auth.uid, "retention.run_all", null, null, {
        rows: out.results.reduce((s, r) => s + r.rowsAffected, 0),
        errors: out.results.filter((r) => r.status === "error").length,
      })
      return NextResponse.json(out)
    }

    const def = getJobDef(String(body.jobKey ?? ""))
    if (!def || !RETENTION_JOBS.some((j) => j.key === def.key)) {
      return NextResponse.json({ error: "Unknown job" }, { status: 400 })
    }

    const res = await runOneRetentionJobNow(def.key as RetentionJobKey)
    await audit(auth.uid, "retention.run_job", def.key, null, { status: res.status, rows: res.rowsAffected })
    return NextResponse.json({ ran: true, results: [res] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Retention run failed" }, { status: 500 })
  }
}
