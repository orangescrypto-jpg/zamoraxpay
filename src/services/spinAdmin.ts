// src/services/spinAdmin.ts
// Service abstraction layer — everything the admin can change about Spin & Win.
// Routes under /api/admin/spin/* call ONLY this file, so validation lives in
// one place and no route writes to the spin tables directly.
//
// Nothing here is hardcoded: sources, prize tables, caps, budgets, expiry,
// odds, popup, winner feed, anti-abuse limits and push toggles are all rows
// the admin edits from /admin/spin with no redeploy.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { isFeatureEnabled, setFeatureFlag } from "@/src/services/config"
import { lookupPrice } from "@/src/services/pricing"
import { sendPushToUsers } from "@/src/services/pushNotifications"
import { SPIN_DEFAULT_PRIZES, SPIN_SETTING_DEFS, SPIN_SOURCE_DEFAULTS } from "@/src/services/spinDefaults"
import {
  DEFAULT_DISCOUNT_SERVICES,
  NETWORKS,
  SPIN_PRIZE_TYPES,
  SPIN_SOURCE_KEYS,
  SPIN_SOURCE_META,
  addDays,
  dayKeyOf,
  endOfDayUtc,
  expectedCostKobo,
  getSpinSettings,
  listPrizes,
  listSources,
  mapPrize,
  sqlTime,
  winChancePercent,
  type SpinFieldDef,
  type SpinPrize,
  type SpinPrizeType,
  type SpinSource,
  type SpinSourceKey,
} from "@/src/services/spinConfig"

const MAX_WEIGHT = 1_000_000
const MAX_KOBO = 100_000_000 // ₦1,000,000 — a sanity ceiling against a typo like an extra zero

export class SpinAdminError extends Error {}

function fail(message: string): never {
  throw new SpinAdminError(message)
}

async function audit(adminId: string, action: string, targetTable: string, targetId: string | null, before: unknown, after: unknown, nativeDB?: any) {
  await d1Query(
    `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), adminId, action, targetTable, targetId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
    nativeDB,
  ).catch((err) => console.error("[spinAdmin] audit log failed:", err))
}

function int(v: unknown, label: string, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number between ${min} and ${max}.`)
  return n
}

/** Admin date input ("2026-10-01T09:00" or a sql time, treated as UTC) → sql time, or null when blank. */
function dateOrNull(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === "") return null
  const s = String(v).trim().replace("T", " ")
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::(\d{2}))?)?$/)
  if (!m) fail(`${label} is not a valid date.`)
  return `${m[1]} ${m[2] ?? "00:00"}:${m[3] ?? "00"}`
}

// ── Overview ──────────────────────────────────────────────────────────

export interface AdminPrize extends SpinPrize {
  /** Chance of landing on this prize, 0-100, from the current weights. */
  chancePercent: number
}

export interface AdminSource extends SpinSource {
  fieldDefs: SpinFieldDef[]
  kind: string
  prizes: AdminPrize[]
  expectedCostPerSpinKobo: number
  winChancePercent: number
  spentTodayKobo: number
  ticketsIssuedToday: number
}

export async function getAdminOverview(nativeDB?: any) {
  const [enabled, sources, settingRows, tierRows] = await Promise.all([
    isFeatureEnabled("spin", nativeDB),
    listSources(nativeDB),
    d1Query("SELECT key, value FROM site_settings WHERE key LIKE 'spin_%'", [], nativeDB),
    d1Query("SELECT * FROM spin_tier_bonuses ORDER BY tier_key, source_key", [], nativeDB),
  ])

  const raw: Record<string, string> = {}
  for (const r of settingRows.results ?? []) raw[r.key] = r.value
  const settings = SPIN_SETTING_DEFS.map((d) => ({ ...d, value: raw[d.key] ?? d.defaultValue }))

  const today = dayKeyOf()
  const spent = await d1Query("SELECT source_key, COALESCE(SUM(cost_kobo), 0) AS n FROM spin_spins WHERE day_key = ? GROUP BY source_key", [today], nativeDB)
  const issued = await d1Query("SELECT source_key, COUNT(*) AS n FROM spin_tickets WHERE day_key = ? GROUP BY source_key", [today], nativeDB)
  const spentBy = new Map<string, number>((spent.results ?? []).map((r: any) => [r.source_key, r.n]))
  const issuedBy = new Map<string, number>((issued.results ?? []).map((r: any) => [r.source_key, r.n]))

  const out: AdminSource[] = []
  for (const s of sources) {
    const prizes = await listPrizes(s.sourceKey, {}, nativeDB) // includes inactive — admin sees everything
    const total = prizes.filter((p) => p.isActive && p.weight > 0).reduce((sum, p) => sum + p.weight, 0)
    out.push({
      ...s,
      kind: SPIN_SOURCE_META[s.sourceKey].kind,
      fieldDefs: SPIN_SOURCE_META[s.sourceKey].fields,
      prizes: prizes.map((p) => ({
        ...p,
        chancePercent: p.isActive && p.weight > 0 && total > 0 ? Math.round((p.weight / total) * 1000) / 10 : 0,
      })),
      expectedCostPerSpinKobo: expectedCostKobo(prizes),
      winChancePercent: winChancePercent(prizes),
      spentTodayKobo: spentBy.get(s.sourceKey) ?? 0,
      ticketsIssuedToday: issuedBy.get(s.sourceKey) ?? 0,
    })
  }

  return {
    enabled,
    settings,
    sources: out,
    tierBonuses: (tierRows.results ?? []).map((r: any) => ({
      tierKey: r.tier_key,
      sourceKey: r.source_key,
      extraTickets: r.extra_tickets,
      weightBoostPercent: r.weight_boost_percent,
      isActive: r.is_active === 1,
    })),
    prizeTypes: SPIN_PRIZE_TYPES,
    networks: NETWORKS,
    defaultDiscountServices: DEFAULT_DISCOUNT_SERVICES,
  }
}

// ── Master switch + global settings ───────────────────────────────────

export async function setMaster(enabled: boolean, adminId: string, nativeDB?: any): Promise<void> {
  await d1Query(
    `INSERT OR IGNORE INTO feature_flags (key, label, description, is_enabled) VALUES ('spin', 'Spin & Win', 'Master switch for spin tickets, the spin wheel and spin prizes.', 1)`,
    [],
    nativeDB,
  )
  await setFeatureFlag("spin", enabled, adminId, nativeDB)
  await audit(adminId, "spin.master", "feature_flags", "spin", null, { enabled }, nativeDB)
}

export async function saveSettings(values: Record<string, unknown>, adminId: string, nativeDB?: any): Promise<void> {
  for (const [key, rawValue] of Object.entries(values)) {
    const def = SPIN_SETTING_DEFS.find((d) => d.key === key)
    if (!def) fail(`Unknown setting: ${key}`)
    let value: string
    if (def.type === "boolean") {
      value = rawValue === true || rawValue === "true" ? "true" : "false"
    } else {
      value = String(int(rawValue, def.label, 0, MAX_KOBO))
    }
    await d1Query(
      `INSERT INTO site_settings (key, label, description, value, value_type, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
      [key, def.label, def.description, value, def.type, adminId],
      nativeDB,
    )
  }
  await audit(adminId, "spin.settings", "site_settings", null, null, values, nativeDB)
}

// ── Sources ───────────────────────────────────────────────────────────

function cleanConfig(sourceKey: SpinSourceKey, input: Record<string, unknown> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of SPIN_SOURCE_META[sourceKey].fields) {
    const v = input?.[f.key]
    if (v === undefined || v === null || v === "") {
      out[f.key] = f.type === "number" || f.type === "kobo" ? 0 : ""
      continue
    }
    switch (f.type) {
      case "number":
      case "kobo":
        out[f.key] = int(v, f.label, 0, MAX_KOBO)
        break
      case "int_list":
      case "kobo_list": {
        const parts = String(v).split(",").map((s) => s.trim()).filter(Boolean)
        for (const p of parts) if (!/^\d+$/.test(p) || Number(p) <= 0) fail(`${f.label}: "${p}" is not a positive whole number.`)
        out[f.key] = parts.join(",")
        break
      }
      case "weekdays": {
        const valid = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        const parts = String(v).split(",").map((s) => s.trim()).filter(Boolean)
        for (const p of parts) if (!valid.includes(p.toLowerCase())) fail(`${f.label}: "${p}" is not a weekday.`)
        out[f.key] = parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(",")
        break
      }
      default:
        out[f.key] = String(v).slice(0, 200)
    }
  }
  return out
}

export async function saveSource(input: any, adminId: string, nativeDB?: any): Promise<void> {
  const sourceKey = input?.sourceKey as SpinSourceKey
  if (!SPIN_SOURCE_KEYS.includes(sourceKey)) fail("Unknown ticket source.")
  const expiryMode = input.expiryMode === "hours" ? "hours" : "end_of_day"

  const startsAt = dateOrNull(input.startsAt, "Start date")
  const endsAt = dateOrNull(input.endsAt, "End date")
  if (startsAt && endsAt && endsAt <= startsAt) fail("End date must be after the start date.")

  const before = await d1Query("SELECT * FROM spin_sources WHERE source_key = ?", [sourceKey], nativeDB)
  if (!before.results?.[0]) fail("Ticket source not found. Run migrations/spin_and_win.sql first.")

  const row = {
    isEnabled: input.isEnabled ? 1 : 0,
    startsAt,
    endsAt,
    ticketsPerAward: int(input.ticketsPerAward, "Tickets per award", 0, 50),
    spinsPerDay: int(input.spinsPerDay, "Spins per day", 0, 100),
    expiryMode,
    expiryHours: int(input.expiryHours ?? 24, "Expiry hours", 1, 24 * 90),
    dailyBudgetKobo: int(input.dailyBudgetKobo ?? 0, "Daily budget", 0, MAX_KOBO * 100),
    guaranteeAfterLosses: int(input.guaranteeAfterLosses ?? 0, "Guarantee after losses", 0, 100),
    config: cleanConfig(sourceKey, input.config),
  }

  await d1Query(
    `UPDATE spin_sources SET is_enabled = ?, starts_at = ?, ends_at = ?, tickets_per_award = ?, spins_per_day = ?,
            expiry_mode = ?, expiry_hours = ?, daily_budget_kobo = ?, guarantee_after_losses = ?, config_json = ?,
            updated_by = ?, updated_at = datetime('now')
      WHERE source_key = ?`,
    [
      row.isEnabled, row.startsAt, row.endsAt, row.ticketsPerAward, row.spinsPerDay, row.expiryMode, row.expiryHours,
      row.dailyBudgetKobo, row.guaranteeAfterLosses, JSON.stringify(row.config), adminId, sourceKey,
    ],
    nativeDB,
  )
  await audit(adminId, "spin.source.save", "spin_sources", sourceKey, before.results[0], row, nativeDB)
}

/** Restores one source's settings AND its prize table to the shipped safe defaults. */
export async function resetSource(sourceKey: string, adminId: string, nativeDB?: any): Promise<void> {
  const def = SPIN_SOURCE_DEFAULTS.find((d) => d.key === sourceKey)
  if (!def) fail("Unknown ticket source.")

  await d1Query(
    `UPDATE spin_sources SET is_enabled = ?, starts_at = NULL, ends_at = NULL, tickets_per_award = ?, spins_per_day = ?,
            expiry_mode = ?, expiry_hours = ?, daily_budget_kobo = ?, guarantee_after_losses = ?, config_json = ?,
            updated_by = ?, updated_at = datetime('now')
      WHERE source_key = ?`,
    [
      def.isEnabled ? 1 : 0, def.ticketsPerAward, def.spinsPerDay, def.expiryMode, def.expiryHours, def.dailyBudgetKobo,
      def.guaranteeAfterLosses, JSON.stringify(def.config), adminId, sourceKey,
    ],
    nativeDB,
  )
  await d1Query("DELETE FROM spin_prizes WHERE source_key = ?", [sourceKey], nativeDB)
  for (const p of SPIN_DEFAULT_PRIZES.filter((x) => x.sourceKey === sourceKey)) {
    await d1Query(
      `INSERT INTO spin_prizes (id, source_key, label, prize_type, amount_kobo, discount_percent, max_discount_kobo, weight, cost_kobo,
              max_wins_per_day, max_wins_per_week, is_guarantee_prize, is_jackpot, color, sort_order, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), p.sourceKey, p.label, p.prizeType, p.amountKobo, p.discountPercent, p.maxDiscountKobo, p.weight, p.costKobo,
        p.maxWinsPerDay, p.maxWinsPerWeek, p.isGuaranteePrize ? 1 : 0, p.isJackpot ? 1 : 0, p.color, p.sortOrder, adminId,
      ],
      nativeDB,
    )
  }
  await audit(adminId, "spin.source.reset", "spin_sources", sourceKey, null, { reset: true }, nativeDB)
}

// ── Prizes: add, edit, delete permanently ─────────────────────────────

export async function savePrize(input: any, adminId: string, nativeDB?: any): Promise<{ id: string }> {
  const sourceKey = String(input?.sourceKey ?? "")
  if (!SPIN_SOURCE_KEYS.includes(sourceKey as SpinSourceKey)) fail("Unknown ticket source.")

  const label = String(input?.label ?? "").trim()
  if (!label) fail("Give the prize a label (it's written on the wheel).")
  if (label.length > 40) fail("Prize label must be 40 characters or fewer.")

  const prizeType = input?.prizeType as SpinPrizeType
  if (!SPIN_PRIZE_TYPES.includes(prizeType)) fail("Choose a prize type.")

  const weight = int(input?.weight ?? 0, "Weight (chance)", 0, MAX_WEIGHT)
  const maxWinsPerDay = int(input?.maxWinsPerDay ?? 0, "Max wins per day", 0, 1_000_000)
  const maxWinsPerWeek = int(input?.maxWinsPerWeek ?? 0, "Max wins per 7 days", 0, 1_000_000)
  const rewardValidDays = int(input?.rewardValidDays ?? 7, "Prize valid for (days)", 1, 365)
  const sortOrder = input?.sortOrder === undefined || input?.sortOrder === null || input?.sortOrder === "" ? null : int(input.sortOrder, "Order", 0, 10_000)

  let color: string | null = input?.color ? String(input.color).trim() : null
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) fail("Colour must look like #2563EB.")

  let amountKobo = 0
  let discountPercent = 0
  let maxDiscountKobo = 0
  let discountServices: string | null = null
  let discountMinPurchaseKobo = 0
  let voucherNetwork: string | null = null
  let voucherPlanCode: string | null = null
  let tokenCount = 0
  let autoCost = 0

  switch (prizeType) {
    case "nothing":
      break
    case "wallet_credit":
      amountKobo = int(input?.amountKobo, "Amount", 1, MAX_KOBO)
      autoCost = amountKobo
      break
    case "discount": {
      discountPercent = int(input?.discountPercent, "Discount %", 1, 100)
      maxDiscountKobo = int(input?.maxDiscountKobo, "Maximum discount", 1, MAX_KOBO)
      discountMinPurchaseKobo = int(input?.discountMinPurchaseKobo ?? 0, "Minimum purchase", 0, MAX_KOBO)
      const services = Array.isArray(input?.discountServices) ? input.discountServices : String(input?.discountServices ?? "").split(",")
      const cleaned = services.map((s: string) => String(s).trim()).filter(Boolean)
      discountServices = cleaned.length > 0 ? cleaned.join(",") : null
      autoCost = maxDiscountKobo // worst case: the cap
      break
    }
    case "airtime_voucher":
      amountKobo = int(input?.amountKobo, "Airtime value", 1, MAX_KOBO)
      voucherNetwork = input?.voucherNetwork ? String(input.voucherNetwork) : null
      if (voucherNetwork && !NETWORKS.includes(voucherNetwork)) fail("Unknown network.")
      autoCost = amountKobo
      break
    case "data_voucher": {
      voucherNetwork = String(input?.voucherNetwork ?? "")
      voucherPlanCode = String(input?.voucherPlanCode ?? "").trim()
      if (!NETWORKS.includes(voucherNetwork)) fail("Choose the network for the data plan.")
      if (!voucherPlanCode) fail("Choose the data plan.")
      const price = await lookupPrice("data", voucherNetwork, voucherPlanCode, "retail", undefined, nativeDB)
      if (!price.found) fail("That data plan isn't in your pricing table (or is switched off). Add it under Pricing first.")
      autoCost = price.baseAmountKobo
      break
    }
    case "streak_protection":
      tokenCount = int(input?.tokenCount ?? 1, "Shields", 1, 30)
      break
  }

  const overrideCost = input?.costKobo === undefined || input?.costKobo === null || input?.costKobo === "" ? 0 : int(input.costKobo, "Cost to you", 0, MAX_KOBO)
  const costKobo = overrideCost > 0 ? overrideCost : autoCost

  const id: string | null = input?.id ? String(input.id) : null
  const flags = [input?.isGuaranteePrize ? 1 : 0, input?.isJackpot ? 1 : 0, input?.isActive === false ? 0 : 1]

  if (id) {
    const before = await d1Query("SELECT * FROM spin_prizes WHERE id = ?", [id], nativeDB)
    if (!before.results?.[0]) fail("That prize no longer exists.")
    await d1Query(
      `UPDATE spin_prizes SET label = ?, prize_type = ?, amount_kobo = ?, discount_percent = ?, max_discount_kobo = ?, discount_services = ?,
              discount_min_purchase_kobo = ?, voucher_network = ?, voucher_plan_code = ?, token_count = ?, reward_valid_days = ?, weight = ?,
              cost_kobo = ?, max_wins_per_day = ?, max_wins_per_week = ?, is_guarantee_prize = ?, is_jackpot = ?, is_active = ?,
              color = ?, sort_order = COALESCE(?, sort_order), updated_by = ?, updated_at = datetime('now')
        WHERE id = ?`,
      [
        label, prizeType, amountKobo, discountPercent, maxDiscountKobo, discountServices, discountMinPurchaseKobo, voucherNetwork,
        voucherPlanCode, tokenCount, rewardValidDays, weight, costKobo, maxWinsPerDay, maxWinsPerWeek, flags[0], flags[1], flags[2],
        color, sortOrder, adminId, id,
      ],
      nativeDB,
    )
    await audit(adminId, "spin.prize.update", "spin_prizes", id, before.results[0], { label, prizeType, amountKobo, weight, costKobo }, nativeDB)
    return { id }
  }

  const newId = randomUUID()
  let order = sortOrder
  if (order === null) {
    const max = await d1Query("SELECT COALESCE(MAX(sort_order), 0) AS m FROM spin_prizes WHERE source_key = ?", [sourceKey], nativeDB)
    order = (max.results?.[0]?.m ?? 0) + 1
  }
  await d1Query(
    `INSERT INTO spin_prizes (id, source_key, label, prize_type, amount_kobo, discount_percent, max_discount_kobo, discount_services,
            discount_min_purchase_kobo, voucher_network, voucher_plan_code, token_count, reward_valid_days, weight, cost_kobo,
            max_wins_per_day, max_wins_per_week, is_guarantee_prize, is_jackpot, is_active, color, sort_order, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId, sourceKey, label, prizeType, amountKobo, discountPercent, maxDiscountKobo, discountServices, discountMinPurchaseKobo,
      voucherNetwork, voucherPlanCode, tokenCount, rewardValidDays, weight, costKobo, maxWinsPerDay, maxWinsPerWeek,
      flags[0], flags[1], flags[2], color, order, adminId,
    ],
    nativeDB,
  )
  await audit(adminId, "spin.prize.create", "spin_prizes", newId, null, { sourceKey, label, prizeType, amountKobo, weight, costKobo }, nativeDB)
  return { id: newId }
}

/**
 * PERMANENTLY deletes a prize. Past wins are unaffected: every spin stores its own
 * snapshot of the prize, and vouchers already won keep working. Default prizes come
 * from a run-once seed, so a deleted prize does not come back.
 */
export async function deletePrize(id: string, adminId: string, nativeDB?: any): Promise<void> {
  const before = await d1Query("SELECT * FROM spin_prizes WHERE id = ?", [id], nativeDB)
  if (!before.results?.[0]) fail("That prize no longer exists.")
  await d1Query("DELETE FROM spin_prizes WHERE id = ?", [id], nativeDB)
  await audit(adminId, "spin.prize.delete", "spin_prizes", id, before.results[0], null, nativeDB)
}

// ── Tier bonuses ──────────────────────────────────────────────────────

export async function saveTierBonus(input: any, adminId: string, nativeDB?: any): Promise<void> {
  const tierKey = String(input?.tierKey ?? "").trim().toLowerCase()
  if (!tierKey || tierKey.length > 40) fail("Enter a tier (e.g. retail, reseller).")
  const sourceKey = String(input?.sourceKey ?? "*")
  if (sourceKey !== "*" && !SPIN_SOURCE_KEYS.includes(sourceKey as SpinSourceKey)) fail("Unknown ticket source.")
  const extraTickets = int(input?.extraTickets ?? 0, "Extra tickets", 0, 20)
  const weightBoostPercent = int(input?.weightBoostPercent ?? 0, "Odds boost %", 0, 1000)

  await d1Query(
    `INSERT INTO spin_tier_bonuses (tier_key, source_key, extra_tickets, weight_boost_percent, is_active, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(tier_key, source_key) DO UPDATE SET extra_tickets = excluded.extra_tickets, weight_boost_percent = excluded.weight_boost_percent,
            is_active = excluded.is_active, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    [tierKey, sourceKey, extraTickets, weightBoostPercent, input?.isActive === false ? 0 : 1, adminId],
    nativeDB,
  )
  await audit(adminId, "spin.tier.save", "spin_tier_bonuses", `${tierKey}:${sourceKey}`, null, { extraTickets, weightBoostPercent }, nativeDB)
}

export async function deleteTierBonus(tierKey: string, sourceKey: string, adminId: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM spin_tier_bonuses WHERE tier_key = ? AND source_key = ?", [tierKey, sourceKey], nativeDB)
  await audit(adminId, "spin.tier.delete", "spin_tier_bonuses", `${tierKey}:${sourceKey}`, null, null, nativeDB)
}

// ── Gift tickets ──────────────────────────────────────────────────────

export async function giftTickets(input: any, adminId: string, nativeDB?: any): Promise<{ users: number; tickets: number }> {
  const target = String(input?.target ?? "")
  if (!["user", "tier", "all"].includes(target)) fail("Choose who receives the tickets.")
  const count = int(input?.count ?? 1, "Tickets each", 1, 20)

  const gift = await d1Query("SELECT is_enabled FROM spin_sources WHERE source_key = 'admin_gift'", [], nativeDB)
  if (gift.results?.[0]?.is_enabled !== 1) fail("Admin gift tickets are switched off. Turn the source on first.")

  const now = new Date()
  const expiresAt = input?.endOfDay ? endOfDayUtc(now) : sqlTime(new Date(now.getTime() + int(input?.expiresInHours ?? 24, "Expires in (hours)", 1, 24 * 90) * 3_600_000))
  const note = input?.note ? String(input.note).slice(0, 120) : "Gift from ZamoraxPay"
  const batch = randomUUID().slice(0, 8)
  const today = dayKeyOf(now)

  let where = "status = 'active'"
  const whereParams: unknown[] = []

  if (target === "user") {
    const id = String(input?.identifier ?? "").trim()
    if (!id) fail("Enter the user's email, phone number or ID.")
    const u = await d1Query("SELECT id FROM users WHERE id = ? OR lower(email) = lower(?) OR phone = ? LIMIT 1", [id, id, id], nativeDB)
    if (!u.results?.[0]) fail("No user found with that email, phone or ID.")
    where += " AND id = ?"
    whereParams.push(u.results[0].id)
  } else if (target === "tier") {
    const tier = String(input?.tier ?? "").trim().toLowerCase()
    if (!tier) fail("Enter the tier.")
    where += " AND tier = ?"
    whereParams.push(tier)
  }

  for (let i = 0; i < count; i++) {
    await d1Query(
      `INSERT OR IGNORE INTO spin_tickets (id, user_id, source_key, status, issue_key, day_key, expires_at, note)
       SELECT lower(hex(randomblob(16))), id, 'admin_gift', 'available', 'gift:' || ? || ':' || id || '#' || ?, ?, ?, ?
         FROM users WHERE ${where}`,
      [batch, i, today, expiresAt, note, ...whereParams],
      nativeDB,
    )
  }

  const tally = await d1Query(
    "SELECT COUNT(*) AS tickets, COUNT(DISTINCT user_id) AS users FROM spin_tickets WHERE issue_key LIKE ?",
    [`gift:${batch}:%`],
    nativeDB,
  )
  const result = { tickets: tally.results?.[0]?.tickets ?? 0, users: tally.results?.[0]?.users ?? 0 }
  await audit(adminId, "spin.gift", "spin_tickets", batch, null, { target, count, ...result, expiresAt }, nativeDB)

  if (input?.notify !== false && result.users > 0) {
    const subs = await d1Query(
      `SELECT DISTINCT user_id FROM spin_tickets t JOIN push_subscriptions p ON p.user_id = t.user_id WHERE t.issue_key LIKE ? LIMIT 500`,
      [`gift:${batch}:%`],
      nativeDB,
    ).catch(() => ({ results: [] as any[] }))
    const ids = (subs.results ?? []).map((r: any) => r.user_id)
    if (ids.length > 0) {
      sendPushToUsers(ids, { title: "A gift for you 🎁", body: "You've been given a free spin. Open the app and spin to win!", url: "/dashboard", tag: "spin-gift" }, nativeDB).catch(() => undefined)
    }
  }

  return result
}

// ── Log / stats ───────────────────────────────────────────────────────

export async function getSpinLog(params: { page?: number; sourceKey?: string }, nativeDB?: any) {
  const limit = 25
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const now = new Date()
  const today = dayKeyOf(now)
  const weekStart = sqlTime(addDays(now, -7))

  const filter = params.sourceKey ? "WHERE s.source_key = ?" : ""
  const filterParams = params.sourceKey ? [params.sourceKey] : []

  const rows = await d1Query(
    `SELECT s.id, s.source_key, s.prize_label, s.prize_type, s.prize_amount_kobo, s.cost_kobo, s.was_guarantee, s.created_at, u.full_name, u.email
       FROM spin_spins s LEFT JOIN users u ON u.id = s.user_id
       ${filter} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...filterParams, limit, (page - 1) * limit],
    nativeDB,
  )

  const [todayT, weekT, allT, bySource, vouchers, tickets] = await Promise.all([
    d1Query("SELECT COUNT(*) AS spins, COALESCE(SUM(cost_kobo),0) AS cost, SUM(CASE WHEN prize_type != 'nothing' THEN 1 ELSE 0 END) AS wins FROM spin_spins WHERE day_key = ?", [today], nativeDB),
    d1Query("SELECT COUNT(*) AS spins, COALESCE(SUM(cost_kobo),0) AS cost, SUM(CASE WHEN prize_type != 'nothing' THEN 1 ELSE 0 END) AS wins FROM spin_spins WHERE created_at >= ?", [weekStart], nativeDB),
    d1Query("SELECT COUNT(*) AS spins, COALESCE(SUM(cost_kobo),0) AS cost, SUM(CASE WHEN prize_type != 'nothing' THEN 1 ELSE 0 END) AS wins FROM spin_spins", [], nativeDB),
    d1Query("SELECT source_key, COUNT(*) AS spins, COALESCE(SUM(cost_kobo),0) AS cost FROM spin_spins WHERE created_at >= ? GROUP BY source_key", [weekStart], nativeDB),
    d1Query("SELECT kind, status, COUNT(*) AS n FROM spin_vouchers GROUP BY kind, status", [], nativeDB),
    d1Query("SELECT status, COUNT(*) AS n FROM spin_tickets GROUP BY status", [], nativeDB),
  ])

  const t = (r: any) => ({ spins: r.results?.[0]?.spins ?? 0, wins: r.results?.[0]?.wins ?? 0, costKobo: r.results?.[0]?.cost ?? 0 })
  return {
    page,
    spins: (rows.results ?? []).map((r: any) => ({
      id: r.id,
      sourceKey: r.source_key,
      prizeLabel: r.prize_label,
      prizeType: r.prize_type,
      amountKobo: r.prize_amount_kobo,
      costKobo: r.cost_kobo,
      wasGuarantee: r.was_guarantee === 1,
      createdAt: r.created_at,
      userName: r.full_name ?? null,
      userEmail: r.email ?? null,
    })),
    totals: { today: t(todayT), last7Days: t(weekT), allTime: t(allT) },
    bySource7d: (bySource.results ?? []).map((r: any) => ({ sourceKey: r.source_key, spins: r.spins, costKobo: r.cost })),
    vouchers: (vouchers.results ?? []).map((r: any) => ({ kind: r.kind, status: r.status, count: r.n })),
    tickets: (tickets.results ?? []).map((r: any) => ({ status: r.status, count: r.n })),
  }
}

// Kept so routes can validate a source key without importing config directly.
export function isSourceKey(k: string): k is SpinSourceKey {
  return SPIN_SOURCE_KEYS.includes(k as SpinSourceKey)
}

export { mapPrize, getSpinSettings }
