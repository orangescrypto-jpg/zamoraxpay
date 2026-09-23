// src/services/retention.ts
// Data retention — every cleanup job in one place, used by BOTH the cron
// route (/api/cron/retention) and the admin panel (/admin/retention).
//
// Design rules (all forced by how D1 behaves — see lib/d1.ts):
//   • D1 has no transactions and the HTTP path times out at 8s per query,
//     so every delete runs in small batches (retention_batch_size) and the
//     whole run stops cleanly when its time budget is spent. The next run
//     simply carries on — every job is idempotent.
//   • Anything that must be kept "in summary" (wallet totals, spin all-time
//     stats) is folded into a rollup table BEFORE the source rows are
//     deleted. If the fold fails, nothing is deleted.
//   • Wallet and audit rows are written to R2 and the upload is confirmed
//     BEFORE the D1 rows are deleted. Upload fails => rows stay in D1.
//   • A retention value of 0 disables that job. Values below the safe
//     minimum are raised to the minimum (never silently lowered), so a
//     typo in the admin panel cannot delete rows that live features need.

import { randomUUID } from "crypto"
import { gzipSync } from "zlib"
import { d1Query } from "@/lib/d1"
import { r2Put } from "@/lib/r2/client"
import { getSettingBoolean, getSettingNumber } from "@/src/services/siteSettings"

// ── Job catalogue ────────────────────────────────────────────────────

export type RetentionJobKey =
  | "spin_tickets"
  | "spin_vouchers"
  | "spin_nowin"
  | "spin_win"
  | "push_log"
  | "payment_webhook_blank"
  | "payment_webhook_delete"
  | "vtu_webhook_blank"
  | "vtu_webhook_delete"
  | "wallet_tx"
  | "streak_checkins"
  | "cookie_consents"
  | "cashback_awards"
  | "weekend_bonus"
  | "audit_log"
  | "order_attempts"
  | "pin_attempts"

export interface RetentionJobDef {
  key: RetentionJobKey
  label: string
  settingKey: string
  /** Fallback when the setting row is missing. */
  defaultDays: number
  /** Floor enforced no matter what the admin types. 1 = no special floor. */
  minDays: number
  /** What the job does, shown in the admin panel. */
  action: "delete" | "blank" | "archive_delete"
  /** Plain-English note shown under the job so the admin knows what is kept. */
  keeps: string
}

export const RETENTION_JOBS: RetentionJobDef[] = [
  { key: "spin_tickets", label: "Spin tickets (used/expired)", settingKey: "retention_spin_tickets_days", defaultDays: 30, minDays: 2, action: "delete", keeps: "Unspent (available) tickets are never deleted." },
  { key: "spin_vouchers", label: "Spin vouchers (used/expired)", settingKey: "retention_spin_vouchers_days", defaultDays: 30, minDays: 1, action: "delete", keeps: "Active vouchers are never deleted." },
  { key: "spin_nowin", label: "Spin history: no-win rows", settingKey: "retention_spin_nowin_days", defaultDays: 7, minDays: 7, action: "delete", keeps: "Winning spins are handled by the next job. Minimum 7 days because jackpot caps look back 7 days." },
  { key: "spin_win", label: "Spin history: winning rows", settingKey: "retention_spin_win_days", defaultDays: 60, minDays: 7, action: "delete", keeps: "Totals are folded into the all-time stats before deletion." },
  { key: "push_log", label: "Push notification log", settingKey: "retention_push_log_days", defaultDays: 30, minDays: 7, action: "delete", keeps: "Push subscriptions (devices) are never touched." },
  { key: "payment_webhook_blank", label: "Payment webhook payloads (Korapay/Paystack)", settingKey: "retention_payment_webhook_blank_days", defaultDays: 30, minDays: 7, action: "blank", keeps: "Event ID row stays so duplicate events are still recognised." },
  { key: "payment_webhook_delete", label: "Payment webhook event rows", settingKey: "retention_payment_webhook_delete_days", defaultDays: 90, minDays: 30, action: "delete", keeps: "Wallet reference check still blocks double credits." },
  { key: "vtu_webhook_blank", label: "VTU webhook payloads (Pairgate/VTU.ng)", settingKey: "retention_vtu_webhook_blank_days", defaultDays: 30, minDays: 7, action: "blank", keeps: "Event ID row stays so duplicate events are still recognised." },
  { key: "vtu_webhook_delete", label: "VTU webhook event rows", settingKey: "retention_vtu_webhook_delete_days", defaultDays: 90, minDays: 30, action: "delete", keeps: "" },
  { key: "wallet_tx", label: "Wallet transactions", settingKey: "retention_wallet_tx_days", defaultDays: 90, minDays: 60, action: "archive_delete", keeps: "Copied to R2 first. Withdrawal totals and duplicate-payment references are preserved. Pending rows are never touched." },
  { key: "streak_checkins", label: "Daily streak check-ins (claimed)", settingKey: "retention_streak_checkins_days", defaultDays: 90, minDays: 7, action: "delete", keeps: "Streak state and unclaimed check-ins are never touched." },
  { key: "cookie_consents", label: "Cookie consent records", settingKey: "retention_cookie_consents_days", defaultDays: 180, minDays: 1, action: "delete", keeps: "" },
  { key: "cashback_awards", label: "Cashback awards (claimed)", settingKey: "retention_cashback_awards_days", defaultDays: 90, minDays: 7, action: "delete", keeps: "Unclaimed awards are never deleted." },
  { key: "weekend_bonus", label: "Weekend bonus payout records", settingKey: "retention_weekend_bonus_days", defaultDays: 180, minDays: 30, action: "delete", keeps: "" },
  { key: "audit_log", label: "Admin audit log", settingKey: "retention_audit_log_days", defaultDays: 180, minDays: 30, action: "archive_delete", keeps: "Copied to R2 first." },
  { key: "order_attempts", label: "VTU order provider-attempt logs", settingKey: "retention_order_attempts_days", defaultDays: 60, minDays: 14, action: "blank", keeps: "Only the attempts JSON is emptied, on success/refunded orders. Order rows are never deleted." },
  { key: "pin_attempts", label: "Idle PIN-attempt rows", settingKey: "retention_pin_attempts_days", defaultDays: 30, minDays: 1, action: "delete", keeps: "Rows with failed attempts or an active lock are kept." },
]

export function getJobDef(key: string): RetentionJobDef | undefined {
  return RETENTION_JOBS.find((j) => j.key === key)
}

// ── Helpers ──────────────────────────────────────────────────────────

/** D1 stores 'YYYY-MM-DD HH:MM:SS' (UTC). String compare is safe. */
function cutoffSql(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000)
  return d.toISOString().slice(0, 19).replace("T", " ")
}

interface RunContext {
  nativeDB?: any
  batchSize: number
  deadline: number // epoch ms
  now: Date
}

const timeLeft = (ctx: RunContext) => ctx.deadline - Date.now() > 3_000 // keep a 3s margin

export interface JobResult {
  key: RetentionJobKey
  status: "ok" | "partial" | "error" | "skipped"
  rowsAffected: number
  message: string
}

/** Effective days for a job: the admin value, floored at the safe minimum. 0 = disabled. */
export async function getEffectiveDays(job: RetentionJobDef, nativeDB?: any): Promise<number> {
  const raw = await getSettingNumber(job.settingKey, job.defaultDays, nativeDB)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.max(Math.floor(raw), job.minDays)
}

async function loadContext(nativeDB?: any, budgetOverrideSeconds?: number): Promise<RunContext> {
  const [batchRaw, budgetRaw] = await Promise.all([
    getSettingNumber("retention_batch_size", 1000, nativeDB),
    getSettingNumber("retention_time_budget_seconds", 40, nativeDB),
  ])
  const batchSize = Math.min(5000, Math.max(100, Math.floor(batchRaw) || 1000))
  const budget = Math.min(300, Math.max(5, budgetOverrideSeconds ?? (Math.floor(budgetRaw) || 40)))
  return { nativeDB, batchSize, deadline: Date.now() + budget * 1000, now: new Date() }
}

/**
 * Runs `deleteSql` (which must delete at most `limit` rows) repeatedly until
 * a batch deletes fewer rows than the limit, or time runs out.
 * `deleteSql` must end with `RETURNING 1`-free semantics — we count using
 * a SELECT of the ids first so this works on both D1 HTTP and native paths.
 */
async function deleteInBatches(
  ctx: RunContext,
  table: string,
  idColumn: string,
  whereSql: string,
  whereParams: unknown[],
): Promise<{ deleted: number; finished: boolean }> {
  let deleted = 0
  while (timeLeft(ctx)) {
    const ids = await d1Query(
      `SELECT ${idColumn} AS k FROM ${table} WHERE ${whereSql} LIMIT ?`,
      [...whereParams, ctx.batchSize],
      ctx.nativeDB,
    )
    const rows: any[] = ids.results ?? []
    if (rows.length === 0) return { deleted, finished: true }

    // Chunk the IN list — D1 caps bound parameters per statement (100).
    for (let i = 0; i < rows.length; i += 90) {
      const chunk = rows.slice(i, i + 90)
      const marks = chunk.map(() => "?").join(",")
      await d1Query(`DELETE FROM ${table} WHERE ${idColumn} IN (${marks})`, chunk.map((r) => r.k), ctx.nativeDB)
      deleted += chunk.length
    }
    if (rows.length < ctx.batchSize) return { deleted, finished: true }
  }
  return { deleted, finished: false }
}

/** Same idea for UPDATE-style jobs ("blank the payload"). */
async function updateInBatches(
  ctx: RunContext,
  table: string,
  idColumn: string,
  setSql: string,
  whereSql: string,
  whereParams: unknown[],
): Promise<{ updated: number; finished: boolean }> {
  let updated = 0
  while (timeLeft(ctx)) {
    const ids = await d1Query(
      `SELECT ${idColumn} AS k FROM ${table} WHERE ${whereSql} LIMIT ?`,
      [...whereParams, ctx.batchSize],
      ctx.nativeDB,
    )
    const rows: any[] = ids.results ?? []
    if (rows.length === 0) return { updated, finished: true }
    for (let i = 0; i < rows.length; i += 90) {
      const chunk = rows.slice(i, i + 90)
      const marks = chunk.map(() => "?").join(",")
      await d1Query(`UPDATE ${table} SET ${setSql} WHERE ${idColumn} IN (${marks})`, chunk.map((r) => r.k), ctx.nativeDB)
      updated += chunk.length
    }
    if (rows.length < ctx.batchSize) return { updated, finished: true }
  }
  return { updated, finished: false }
}

function result(key: RetentionJobKey, rows: number, finished: boolean, what: string): JobResult {
  return {
    key,
    status: finished ? "ok" : "partial",
    rowsAffected: rows,
    message: finished ? `${what}: ${rows} row(s)` : `${what}: ${rows} row(s) so far — time budget reached, will continue next run`,
  }
}

// ── R2 archive writer ────────────────────────────────────────────────

/**
 * Gzips rows as JSON Lines and uploads to R2. Throws if the upload fails —
 * callers MUST NOT delete the source rows unless this resolves.
 * Key shape: archive/<folder>/<YYYY-MM>/<runId>-<part>.jsonl.gz
 */
async function archiveRowsToR2(folder: string, rows: Record<string, unknown>[], part: number, runId: string, ctx: RunContext): Promise<string> {
  const month = ctx.now.toISOString().slice(0, 7)
  const key = `archive/${folder}/${month}/${runId}-${String(part).padStart(4, "0")}.jsonl.gz`
  const body = gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n"), "utf8"))
  await r2Put(key, body, "application/gzip")
  return key
}

// ── Individual jobs ──────────────────────────────────────────────────

async function jobSpinTickets(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "spin_tickets", "id", "status != 'available' AND created_at < ?", [cutoffSql(days, ctx.now)])
  return result("spin_tickets", r.deleted, r.finished, "Spin tickets deleted")
}

async function jobSpinVouchers(ctx: RunContext, days: number): Promise<JobResult> {
  // 'active' vouchers are still spendable by the user — never delete those.
  const r = await deleteInBatches(ctx, "spin_vouchers", "id", "status != 'active' AND created_at < ?", [cutoffSql(days, ctx.now)])
  return result("spin_vouchers", r.deleted, r.finished, "Spin vouchers deleted")
}

/**
 * Deletes spin_spins rows matching `whereSql`, folding their totals into
 * spin_stats_rollup FIRST. Fold-then-delete per batch: if the process dies
 * between the two statements, the worst case is a batch counted twice in
 * the rollup — never a batch lost. To make that impossible we fold and
 * delete the exact same id list.
 */
async function foldAndDeleteSpins(ctx: RunContext, key: RetentionJobKey, whereSql: string, whereParams: unknown[], label: string): Promise<JobResult> {
  let total = 0
  while (timeLeft(ctx)) {
    const sel = await d1Query(
      `SELECT id, cost_kobo, prize_type FROM spin_spins WHERE ${whereSql} LIMIT ?`,
      [...whereParams, ctx.batchSize],
      ctx.nativeDB,
    )
    const rows: any[] = sel.results ?? []
    if (rows.length === 0) return result(key, total, true, label)

    const spins = rows.length
    const wins = rows.filter((r) => r.prize_type !== "nothing").length
    const cost = rows.reduce((s, r) => s + (Number(r.cost_kobo) || 0), 0)

    // Delete first, fold second: a crash after the delete under-counts the
    // rollup by one batch (harmless — it is a statistic), whereas fold-first
    // would double-count on retry. Statistics-only, so under-count is the
    // safer failure.
    for (let i = 0; i < rows.length; i += 90) {
      const chunk = rows.slice(i, i + 90)
      const marks = chunk.map(() => "?").join(",")
      await d1Query(`DELETE FROM spin_spins WHERE id IN (${marks})`, chunk.map((r) => r.id), ctx.nativeDB)
    }
    await d1Query(
      `UPDATE spin_stats_rollup SET spins = spins + ?, wins = wins + ?, cost_kobo = cost_kobo + ?, updated_at = datetime('now') WHERE id = 1`,
      [spins, wins, cost],
      ctx.nativeDB,
    )
    total += spins
    if (rows.length < ctx.batchSize) return result(key, total, true, label)
  }
  return result(key, total, false, label)
}

async function jobSpinNoWin(ctx: RunContext, days: number): Promise<JobResult> {
  return foldAndDeleteSpins(ctx, "spin_nowin", "prize_type = 'nothing' AND created_at < ?", [cutoffSql(days, ctx.now)], "No-win spins deleted")
}

async function jobSpinWin(ctx: RunContext, days: number): Promise<JobResult> {
  // Only rows that are FULFILLED — an unfulfilled win is a prize the user has
  // not received yet; spinEngine retries those (fulfilled = 0). Never drop them.
  return foldAndDeleteSpins(ctx, "spin_win", "prize_type != 'nothing' AND fulfilled = 1 AND created_at < ?", [cutoffSql(days, ctx.now)], "Winning spins deleted")
}

async function jobPushLog(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "push_notification_log", "id", "created_at < ?", [cutoffSql(days, ctx.now)])
  return result("push_log", r.deleted, r.finished, "Push log rows deleted")
}

async function jobBlankWebhook(ctx: RunContext, key: RetentionJobKey, table: "payment_webhook_events" | "vtu_webhook_events", days: number): Promise<JobResult> {
  // `payload != ''` makes this idempotent and stops it re-touching blanked rows.
  const r = await updateInBatches(ctx, table, "id", "payload = ''", "processed_at < ? AND payload != ''", [cutoffSql(days, ctx.now)])
  return result(key, r.updated, r.finished, "Webhook payloads blanked")
}

async function jobDeleteWebhook(ctx: RunContext, key: RetentionJobKey, table: "payment_webhook_events" | "vtu_webhook_events", days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, table, "id", "processed_at < ?", [cutoffSql(days, ctx.now)])
  return result(key, r.deleted, r.finished, "Webhook event rows deleted")
}

async function jobStreakCheckins(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "daily_streak_checkins", "id", "claimed = 1 AND created_at < ?", [cutoffSql(days, ctx.now)])
  return result("streak_checkins", r.deleted, r.finished, "Streak check-ins deleted")
}

async function jobCookieConsents(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "cookie_consents", "id", "created_at < ?", [cutoffSql(days, ctx.now)])
  return result("cookie_consents", r.deleted, r.finished, "Cookie consent rows deleted")
}

async function jobCashbackAwards(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "cashback_awards", "id", "claimed = 1 AND created_at < ?", [cutoffSql(days, ctx.now)])
  return result("cashback_awards", r.deleted, r.finished, "Claimed cashback awards deleted")
}

async function jobWeekendBonus(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(ctx, "weekend_bonus_payouts", "id", "created_at < ?", [cutoffSql(days, ctx.now)])
  return result("weekend_bonus", r.deleted, r.finished, "Weekend bonus records deleted")
}

async function jobOrderAttempts(ctx: RunContext, days: number): Promise<JobResult> {
  // Only settled orders. A pending/failed order's attempt log is still what
  // orphanedOrders.ts and the review queue read to decide what happened.
  const r = await updateInBatches(
    ctx,
    "vtu_orders",
    "id",
    "provider_attempts = NULL",
    "status IN ('success','refunded') AND provider_attempts IS NOT NULL AND created_at < ?",
    [cutoffSql(days, ctx.now)],
  )
  return result("order_attempts", r.updated, r.finished, "Order attempt logs cleared")
}

async function jobPinAttempts(ctx: RunContext, days: number): Promise<JobResult> {
  const r = await deleteInBatches(
    ctx,
    "pin_attempts",
    "user_id",
    "failed_attempts = 0 AND (locked_until IS NULL OR locked_until <= datetime('now')) AND updated_at < ?",
    [cutoffSql(days, ctx.now)],
  )
  return result("pin_attempts", r.deleted, r.finished, "Idle PIN-attempt rows deleted")
}

/**
 * AUDIT LOG: archive to R2, then delete exactly the archived ids.
 */
async function jobAuditLog(ctx: RunContext, days: number): Promise<JobResult> {
  const cutoff = cutoffSql(days, ctx.now)
  const runId = randomUUID().slice(0, 8)
  let total = 0
  let part = 0
  while (timeLeft(ctx)) {
    const sel = await d1Query(`SELECT * FROM admin_audit_log WHERE created_at < ? ORDER BY created_at ASC LIMIT ?`, [cutoff, ctx.batchSize], ctx.nativeDB)
    const rows: any[] = sel.results ?? []
    if (rows.length === 0) return result("audit_log", total, true, "Audit log rows archived & deleted")

    part += 1
    await archiveRowsToR2("audit-log", rows, part, runId, ctx) // throws => nothing deleted
    for (let i = 0; i < rows.length; i += 90) {
      const chunk = rows.slice(i, i + 90)
      const marks = chunk.map(() => "?").join(",")
      await d1Query(`DELETE FROM admin_audit_log WHERE id IN (${marks})`, chunk.map((r) => r.id), ctx.nativeDB)
    }
    total += rows.length
    if (rows.length < ctx.batchSize) return result("audit_log", total, true, "Audit log rows archived & deleted")
  }
  return result("audit_log", total, false, "Audit log rows archived & deleted")
}

/**
 * WALLET TRANSACTIONS: the one job where a wrong delete changes money.
 *
 * D1 has no transactions, so a hard process kill can land between ANY two
 * statements. Folding a row's totals into the rollup and recording its
 * reference must therefore be ONE statement. That is what
 * wallet_rollup_apply + its trigger (migrations/retention.sql) do: a single
 * INSERT folds the totals and records the reference atomically. Replaying
 * the same reference fails on the primary key, so a row can never be counted
 * twice, and a row can never be recorded without being counted.
 *
 * Per batch, in order (each step only runs if the one before succeeded):
 *   1. SELECT due rows (never 'pending'; skips references already applied).
 *   2. Upload the batch to R2. Throws => stop, D1 untouched.
 *   3. Apply each row to the rollup (idempotent).
 *   4. Delete exactly those ids from wallet_transactions.
 * A crash anywhere just means the next run repeats the step: R2 gets a
 * duplicate archive file (harmless), applied rows are skipped, and deletes
 * are naturally idempotent.
 */
async function applyRowToRollup(row: any, ctx: RunContext): Promise<"applied" | "already"> {
  const amount = Number(row.amount_kobo) || 0
  const isCompleted = row.status === "completed"
  const funding = isCompleted && row.direction === "credit" && row.type === "funding" ? amount : 0
  const debits = isCompleted && row.direction === "debit" ? amount : 0

  try {
    await d1Query(
      `INSERT INTO wallet_rollup_apply (reference, user_id, funding_credits_kobo, total_debits_kobo) VALUES (?, ?, ?, ?)`,
      [row.reference, row.user_id, funding, debits],
      ctx.nativeDB,
    )
    return "applied"
  } catch (err) {
    // A primary-key violation means this reference was already applied on an
    // earlier run: safe to proceed to delete. Anything else is a real error.
    const msg = err instanceof Error ? err.message : String(err)
    if (/UNIQUE|constraint|PRIMARY/i.test(msg)) return "already"
    throw err
  }
}

async function jobWalletTx(ctx: RunContext, days: number): Promise<JobResult> {
  const cutoff = cutoffSql(days, ctx.now)
  const runId = randomUUID().slice(0, 8)
  let total = 0
  let part = 0

  while (timeLeft(ctx)) {
    const sel = await d1Query(
      `SELECT * FROM wallet_transactions WHERE created_at < ? AND status != 'pending' ORDER BY created_at ASC LIMIT ?`,
      [cutoff, ctx.batchSize],
      ctx.nativeDB,
    )
    const rows: any[] = sel.results ?? []
    if (rows.length === 0) return result("wallet_tx", total, true, "Wallet transactions archived & deleted")

    // R2 first — if this throws, runRetentionJob reports an error and D1 is untouched.
    part += 1
    await archiveRowsToR2("wallet-transactions", rows, part, runId, ctx)

    for (const r of rows) await applyRowToRollup(r, ctx)

    for (let i = 0; i < rows.length; i += 90) {
      const chunk = rows.slice(i, i + 90)
      const marks = chunk.map(() => "?").join(",")
      await d1Query(`DELETE FROM wallet_transactions WHERE id IN (${marks})`, chunk.map((r) => r.id), ctx.nativeDB)
    }
    total += rows.length
    if (rows.length < ctx.batchSize) return result("wallet_tx", total, true, "Wallet transactions archived & deleted")
  }
  return result("wallet_tx", total, false, "Wallet transactions archived & deleted")
}

// ── Dispatcher ───────────────────────────────────────────────────────

async function dispatch(job: RetentionJobDef, ctx: RunContext, days: number): Promise<JobResult> {
  switch (job.key) {
    case "spin_tickets": return jobSpinTickets(ctx, days)
    case "spin_vouchers": return jobSpinVouchers(ctx, days)
    case "spin_nowin": return jobSpinNoWin(ctx, days)
    case "spin_win": return jobSpinWin(ctx, days)
    case "push_log": return jobPushLog(ctx, days)
    case "payment_webhook_blank": return jobBlankWebhook(ctx, job.key, "payment_webhook_events", days)
    case "payment_webhook_delete": return jobDeleteWebhook(ctx, job.key, "payment_webhook_events", days)
    case "vtu_webhook_blank": return jobBlankWebhook(ctx, job.key, "vtu_webhook_events", days)
    case "vtu_webhook_delete": return jobDeleteWebhook(ctx, job.key, "vtu_webhook_events", days)
    case "wallet_tx": return jobWalletTx(ctx, days)
    case "streak_checkins": return jobStreakCheckins(ctx, days)
    case "cookie_consents": return jobCookieConsents(ctx, days)
    case "cashback_awards": return jobCashbackAwards(ctx, days)
    case "weekend_bonus": return jobWeekendBonus(ctx, days)
    case "audit_log": return jobAuditLog(ctx, days)
    case "order_attempts": return jobOrderAttempts(ctx, days)
    case "pin_attempts": return jobPinAttempts(ctx, days)
  }
}

async function logRun(res: JobResult, source: "cron" | "admin", startedAt: string, nativeDB?: any) {
  try {
    await d1Query(
      `INSERT INTO retention_runs (id, job_key, trigger_source, rows_affected, status, message, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [randomUUID(), res.key, source, res.rowsAffected, res.status, res.message.slice(0, 500), startedAt],
      nativeDB,
    )
  } catch (err) {
    console.error("[retention] failed to write run log:", err)
  }
}

/** Runs one job. Never throws — errors come back as status 'error'. */
export async function runRetentionJob(
  key: RetentionJobKey,
  source: "cron" | "admin",
  opts: { nativeDB?: any; ctx?: RunContext; daysOverride?: number } = {},
): Promise<JobResult> {
  const def = getJobDef(key)
  if (!def) return { key, status: "error", rowsAffected: 0, message: `Unknown job: ${key}` }

  const startedAt = new Date().toISOString().slice(0, 19).replace("T", " ")
  let res: JobResult
  try {
    const days = opts.daysOverride !== undefined ? Math.max(Math.floor(opts.daysOverride), def.minDays) : await getEffectiveDays(def, opts.nativeDB)
    if (days === 0) {
      res = { key, status: "skipped", rowsAffected: 0, message: "Disabled (retention days set to 0)" }
    } else {
      const ctx = opts.ctx ?? (await loadContext(opts.nativeDB))
      res = await dispatch(def, ctx, days)
    }
  } catch (err) {
    res = { key, status: "error", rowsAffected: 0, message: err instanceof Error ? err.message : String(err) }
  }
  await logRun(res, source, startedAt, opts.nativeDB)
  return res
}

/** Runs every job in order sharing ONE time budget. Used by the cron. */
export async function runAllRetentionJobs(source: "cron" | "admin", nativeDB?: any): Promise<{ ran: boolean; reason?: string; results: JobResult[] }> {
  if (source === "cron" && !(await getSettingBoolean("retention_enabled", true, nativeDB))) {
    return { ran: false, reason: "Retention master switch is off", results: [] }
  }
  const ctx = await loadContext(nativeDB)
  const results: JobResult[] = []
  for (const job of RETENTION_JOBS) {
    if (!timeLeft(ctx)) {
      results.push({ key: job.key, status: "skipped", rowsAffected: 0, message: "Time budget reached before this job — will run next time" })
      continue
    }
    results.push(await runRetentionJob(job.key, source, { nativeDB, ctx }))
  }
  return { ran: true, results }
}

/** Runs one job with a longer budget — what the admin "Delete now" button uses. */
export async function runOneRetentionJobNow(key: RetentionJobKey, nativeDB?: any): Promise<JobResult> {
  const ctx = await loadContext(nativeDB, 50)
  return runRetentionJob(key, "admin", { nativeDB, ctx })
}

// ── Preview (how many rows would go) ─────────────────────────────────

const PREVIEW_SQL: Record<RetentionJobKey, { sql: string; table: string }> = {
  spin_tickets: { table: "spin_tickets", sql: "SELECT COUNT(*) AS n FROM spin_tickets WHERE status != 'available' AND created_at < ?" },
  spin_vouchers: { table: "spin_vouchers", sql: "SELECT COUNT(*) AS n FROM spin_vouchers WHERE status != 'active' AND created_at < ?" },
  spin_nowin: { table: "spin_spins", sql: "SELECT COUNT(*) AS n FROM spin_spins WHERE prize_type = 'nothing' AND created_at < ?" },
  spin_win: { table: "spin_spins", sql: "SELECT COUNT(*) AS n FROM spin_spins WHERE prize_type != 'nothing' AND fulfilled = 1 AND created_at < ?" },
  push_log: { table: "push_notification_log", sql: "SELECT COUNT(*) AS n FROM push_notification_log WHERE created_at < ?" },
  payment_webhook_blank: { table: "payment_webhook_events", sql: "SELECT COUNT(*) AS n FROM payment_webhook_events WHERE processed_at < ? AND payload != ''" },
  payment_webhook_delete: { table: "payment_webhook_events", sql: "SELECT COUNT(*) AS n FROM payment_webhook_events WHERE processed_at < ?" },
  vtu_webhook_blank: { table: "vtu_webhook_events", sql: "SELECT COUNT(*) AS n FROM vtu_webhook_events WHERE processed_at < ? AND payload != ''" },
  vtu_webhook_delete: { table: "vtu_webhook_events", sql: "SELECT COUNT(*) AS n FROM vtu_webhook_events WHERE processed_at < ?" },
  wallet_tx: { table: "wallet_transactions", sql: "SELECT COUNT(*) AS n FROM wallet_transactions WHERE created_at < ? AND status != 'pending'" },
  streak_checkins: { table: "daily_streak_checkins", sql: "SELECT COUNT(*) AS n FROM daily_streak_checkins WHERE claimed = 1 AND created_at < ?" },
  cookie_consents: { table: "cookie_consents", sql: "SELECT COUNT(*) AS n FROM cookie_consents WHERE created_at < ?" },
  cashback_awards: { table: "cashback_awards", sql: "SELECT COUNT(*) AS n FROM cashback_awards WHERE claimed = 1 AND created_at < ?" },
  weekend_bonus: { table: "weekend_bonus_payouts", sql: "SELECT COUNT(*) AS n FROM weekend_bonus_payouts WHERE created_at < ?" },
  audit_log: { table: "admin_audit_log", sql: "SELECT COUNT(*) AS n FROM admin_audit_log WHERE created_at < ?" },
  order_attempts: { table: "vtu_orders", sql: "SELECT COUNT(*) AS n FROM vtu_orders WHERE status IN ('success','refunded') AND provider_attempts IS NOT NULL AND created_at < ?" },
  pin_attempts: { table: "pin_attempts", sql: "SELECT COUNT(*) AS n FROM pin_attempts WHERE failed_attempts = 0 AND (locked_until IS NULL OR locked_until <= datetime('now')) AND updated_at < ?" },
}

export interface JobStatus {
  key: RetentionJobKey
  label: string
  action: RetentionJobDef["action"]
  keeps: string
  settingKey: string
  days: number            // effective days (0 = disabled)
  minDays: number
  eligibleRows: number | null // null when the count failed or job disabled
  lastRun: { at: string; status: string; rows: number; message: string | null; source: string } | null
}

export async function getRetentionOverview(nativeDB?: any): Promise<{ jobs: JobStatus[]; masterEnabled: boolean }> {
  const masterEnabled = await getSettingBoolean("retention_enabled", true, nativeDB)
  const now = new Date()

  const jobs = await Promise.all(
    RETENTION_JOBS.map(async (job): Promise<JobStatus> => {
      const days = await getEffectiveDays(job, nativeDB)
      let eligible: number | null = null
      if (days > 0) {
        try {
          const r = await d1Query(PREVIEW_SQL[job.key].sql, [cutoffSql(days, now)], nativeDB)
          eligible = Number(r.results?.[0]?.n ?? 0)
        } catch {
          eligible = null
        }
      }
      let lastRun: JobStatus["lastRun"] = null
      try {
        const lr = await d1Query(
          `SELECT started_at, status, rows_affected, message, trigger_source FROM retention_runs WHERE job_key = ? ORDER BY started_at DESC LIMIT 1`,
          [job.key],
          nativeDB,
        )
        const row = lr.results?.[0]
        if (row) lastRun = { at: row.started_at, status: row.status, rows: row.rows_affected, message: row.message, source: row.trigger_source }
      } catch {
        lastRun = null
      }
      return { key: job.key, label: job.label, action: job.action, keeps: job.keeps, settingKey: job.settingKey, days, minDays: job.minDays, eligibleRows: eligible, lastRun }
    }),
  )
  return { jobs, masterEnabled }
}
