// src/services/spinConfig.ts
// Service abstraction layer — Spin & Win configuration, types and helpers.
//
// Everything about the spin is admin-controlled (see /admin/spin):
//   - the master switch is the 'spin' feature flag
//   - each ticket source is a row in spin_sources (on/off, dates, spins
//     per day, expiry, daily budget, guarantee, source-specific config)
//   - each source has its OWN prize table (spin_prizes)
//   - global anti-abuse / popup / winner-feed / push knobs live in
//     site_settings under the spin_* prefix
// Nothing here is hardcoded except the fallback used when a row is
// missing. ALL DATES AND "DAYS" ARE UTC, same as the daily streak.

import { d1Query } from "@/lib/d1"
import { isFeatureEnabled } from "@/src/services/config"
import { SPIN_SETTING_DEFS } from "@/src/services/spinDefaults"

export type SpinSourceKey =
  | "streak_milestone"
  | "anytime"
  | "purchase"
  | "deposit"
  | "referral"
  | "first_purchase_of_day"
  | "spend_milestone"
  | "weekend"
  | "admin_gift"
  | "scratch_card"
  | "mystery_box"

export const SPIN_SOURCE_KEYS: SpinSourceKey[] = [
  "streak_milestone",
  "anytime",
  "purchase",
  "deposit",
  "referral",
  "first_purchase_of_day",
  "spend_milestone",
  "weekend",
  "admin_gift",
  "scratch_card",
  "mystery_box",
]

export type SpinPrizeType =
  | "nothing"
  | "wallet_credit"
  | "discount"
  | "airtime_voucher"
  | "data_voucher"
  | "streak_protection"

export const SPIN_PRIZE_TYPES: SpinPrizeType[] = [
  "nothing",
  "wallet_credit",
  "discount",
  "airtime_voucher",
  "data_voucher",
  "streak_protection",
]

/** Services a discount coupon applies to when the prize doesn't restrict it. Betting is never included by default. */
export const DEFAULT_DISCOUNT_SERVICES = ["airtime", "data", "cable", "electricity", "exam_pin", "epin"]

export const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"]

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// How a source hands out tickets:
//   event  — a hook fires on something the user did (check-in, purchase, deposit, referral)
//   lazy   — issued to the user the first time they load the dashboard that day (anytime, weekend)
//   manual — only an admin creates them
export type SpinSourceKind = "event" | "lazy" | "manual"

export interface SpinFieldDef {
  key: string
  label: string
  // number: plain integer. kobo: naira in the UI, kobo in storage. text: free text.
  // int_list: comma list of integers. kobo_list: comma list of naira in the UI, kobo in storage.
  // weekdays: comma list of weekday names.
  type: "number" | "kobo" | "text" | "int_list" | "kobo_list" | "weekdays"
  help?: string
}

export interface SpinSourceMeta {
  kind: SpinSourceKind
  fields: SpinFieldDef[]
}

export const SPIN_SOURCE_META: Record<SpinSourceKey, SpinSourceMeta> = {
  streak_milestone: {
    kind: "event",
    fields: [
      {
        key: "milestone_days",
        label: "Milestone days",
        type: "int_list",
        help: "Streak days that earn a spin, e.g. 7,14,30. A user checking in on day 7 gets the spin automatically.",
      },
      {
        key: "milestone_interval",
        label: "…or every N days",
        type: "number",
        help: "Also give a spin every N streak days (7 = day 7, 14, 21…). 0 = off.",
      },
    ],
  },
  anytime: { kind: "lazy", fields: [] },
  purchase: {
    kind: "event",
    fields: [{ key: "min_amount_kobo", label: "Minimum purchase", type: "kobo", help: "A purchase must be at least this much to earn a spin." }],
  },
  deposit: {
    kind: "event",
    fields: [{ key: "min_amount_kobo", label: "Minimum deposit", type: "kobo", help: "A wallet funding must be at least this much to earn a spin." }],
  },
  referral: { kind: "event", fields: [] },
  first_purchase_of_day: {
    kind: "event",
    fields: [{ key: "min_amount_kobo", label: "Minimum purchase", type: "kobo", help: "The first purchase of the day at or above this amount earns the spin." }],
  },
  spend_milestone: {
    kind: "event",
    fields: [
      {
        key: "targets_kobo",
        label: "Monthly spend targets",
        type: "kobo_list",
        help: "Comma list, e.g. 20000,50000. Each time a user's spending this month crosses a target they earn one spin (once per target per month).",
      },
    ],
  },
  weekend: {
    kind: "lazy",
    fields: [{ key: "active_weekdays", label: "Days it appears", type: "weekdays", help: "Weekday names, e.g. Saturday,Sunday." }],
  },
  admin_gift: { kind: "manual", fields: [] },
  scratch_card: { kind: "lazy", fields: [] },
  mystery_box: {
    kind: "event",
    fields: [{ key: "min_amount_kobo", label: "Minimum purchase", type: "kobo", help: "A purchase must be at least this much to earn a mystery box." }],
  },
}

export interface SpinSource {
  sourceKey: SpinSourceKey
  label: string
  description: string | null
  isEnabled: boolean
  startsAt: string | null
  endsAt: string | null
  ticketsPerAward: number
  spinsPerDay: number
  expiryMode: "end_of_day" | "hours"
  expiryHours: number
  dailyBudgetKobo: number
  guaranteeAfterLosses: number
  config: Record<string, any>
}

export interface SpinPrize {
  id: string
  sourceKey: SpinSourceKey
  label: string
  prizeType: SpinPrizeType
  amountKobo: number
  discountPercent: number
  maxDiscountKobo: number
  discountServices: string | null
  discountMinPurchaseKobo: number
  voucherNetwork: string | null
  voucherPlanCode: string | null
  tokenCount: number
  rewardValidDays: number
  weight: number
  costKobo: number
  maxWinsPerDay: number
  maxWinsPerWeek: number
  isGuaranteePrize: boolean
  isJackpot: boolean
  color: string | null
  sortOrder: number
  isActive: boolean
}

export interface SpinSettings {
  popupEnabled: boolean
  globalDailyCapPerUser: number
  globalDailyBudgetKobo: number
  maxAccountsPerDevicePerDay: number
  maxSpinsPerIpPerDay: number
  winnerFeedEnabled: boolean
  winnerFeedMinKobo: number
  winnerFeedLimit: number
  pushTicketEarned: boolean
  pushExpiryNudge: boolean
  pushExpiryWindowHours: number
  pushAnytimeReady: boolean
}

// ── Time helpers (UTC everywhere) ─────────────────────────────────────

/** 'YYYY-MM-DD HH:MM:SS' UTC — the same shape as SQLite's datetime('now'). */
export function sqlTime(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ")
}

export function fromSqlTime(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z")
}

/** 'YYYY-MM-DD' (UTC). */
export function dayKeyOf(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Next 00:00:00 UTC after d, as a sql time. */
export function endOfDayUtc(d: Date = new Date()): string {
  return sqlTime(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)))
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000)
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

/** When a ticket issued now expires, per the source's admin-set expiry rule. */
export function computeExpiry(src: Pick<SpinSource, "expiryMode" | "expiryHours">, now: Date = new Date()): string {
  if (src.expiryMode === "hours") return sqlTime(addHours(now, Math.max(1, src.expiryHours)))
  return endOfDayUtc(now)
}

export function isWithinWindow(src: Pick<SpinSource, "startsAt" | "endsAt">, now: Date = new Date()): boolean {
  const n = sqlTime(now)
  if (src.startsAt && src.startsAt > n) return false
  if (src.endsAt && src.endsAt < n) return false
  return true
}

export function weekdayNameOf(d: Date = new Date()): string {
  return WEEKDAY_NAMES[d.getUTCDay()]
}

// ── Parsing helpers ───────────────────────────────────────────────────

export function parseIntList(raw: unknown): number[] {
  if (raw === null || raw === undefined) return []
  return String(raw)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n))
}

export function parseWeekdays(raw: unknown): string[] {
  if (raw === null || raw === undefined) return []
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function safeJson<T = any>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// ── Row mapping ───────────────────────────────────────────────────────

export function mapSource(row: any): SpinSource {
  return {
    sourceKey: row.source_key,
    label: row.label,
    description: row.description ?? null,
    isEnabled: row.is_enabled === 1,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    ticketsPerAward: row.tickets_per_award ?? 1,
    spinsPerDay: row.spins_per_day ?? 0,
    expiryMode: row.expiry_mode === "hours" ? "hours" : "end_of_day",
    expiryHours: row.expiry_hours ?? 24,
    dailyBudgetKobo: row.daily_budget_kobo ?? 0,
    guaranteeAfterLosses: row.guarantee_after_losses ?? 0,
    config: safeJson(row.config_json, {}),
  }
}

export function mapPrize(row: any): SpinPrize {
  return {
    id: row.id,
    sourceKey: row.source_key,
    label: row.label,
    prizeType: row.prize_type,
    amountKobo: row.amount_kobo ?? 0,
    discountPercent: row.discount_percent ?? 0,
    maxDiscountKobo: row.max_discount_kobo ?? 0,
    discountServices: row.discount_services ?? null,
    discountMinPurchaseKobo: row.discount_min_purchase_kobo ?? 0,
    voucherNetwork: row.voucher_network ?? null,
    voucherPlanCode: row.voucher_plan_code ?? null,
    tokenCount: row.token_count ?? 0,
    rewardValidDays: row.reward_valid_days ?? 7,
    weight: row.weight ?? 0,
    costKobo: row.cost_kobo ?? 0,
    maxWinsPerDay: row.max_wins_per_day ?? 0,
    maxWinsPerWeek: row.max_wins_per_week ?? 0,
    isGuaranteePrize: row.is_guarantee_prize === 1,
    isJackpot: row.is_jackpot === 1,
    color: row.color ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active === 1,
  }
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function isSpinEnabled(nativeDB?: any): Promise<boolean> {
  return isFeatureEnabled("spin", nativeDB)
}

export async function listSources(nativeDB?: any): Promise<SpinSource[]> {
  const result = await d1Query("SELECT * FROM spin_sources", [], nativeDB)
  const byKey = new Map<string, SpinSource>()
  for (const row of result.results ?? []) byKey.set(row.source_key, mapSource(row))
  // Stable, meaningful order (not alphabetical).
  return SPIN_SOURCE_KEYS.map((k) => byKey.get(k)).filter((s): s is SpinSource => Boolean(s))
}

export async function getSource(sourceKey: string, nativeDB?: any): Promise<SpinSource | null> {
  const result = await d1Query("SELECT * FROM spin_sources WHERE source_key = ?", [sourceKey], nativeDB)
  const row = result.results?.[0]
  return row ? mapSource(row) : null
}

export async function listPrizes(sourceKey: string, opts: { activeOnly?: boolean } = {}, nativeDB?: any): Promise<SpinPrize[]> {
  const result = await d1Query(
    `SELECT * FROM spin_prizes WHERE source_key = ? ${opts.activeOnly ? "AND is_active = 1" : ""}
     ORDER BY sort_order ASC, created_at ASC, id ASC`,
    [sourceKey],
    nativeDB,
  )
  return (result.results ?? []).map(mapPrize)
}

export async function getSpinSettings(nativeDB?: any): Promise<SpinSettings> {
  const result = await d1Query("SELECT key, value FROM site_settings WHERE key LIKE 'spin_%'", [], nativeDB)
  const raw: Record<string, string> = {}
  for (const row of result.results ?? []) raw[row.key] = row.value
  for (const def of SPIN_SETTING_DEFS) if (raw[def.key] === undefined) raw[def.key] = def.defaultValue

  const num = (k: string) => {
    const n = Number(raw[k])
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  const bool = (k: string) => raw[k] === "true"

  return {
    popupEnabled: bool("spin_popup_enabled"),
    globalDailyCapPerUser: num("spin_global_daily_cap_per_user"),
    globalDailyBudgetKobo: num("spin_global_daily_budget_kobo"),
    maxAccountsPerDevicePerDay: num("spin_max_accounts_per_device_per_day"),
    maxSpinsPerIpPerDay: num("spin_max_spins_per_ip_per_day"),
    winnerFeedEnabled: bool("spin_winner_feed_enabled"),
    winnerFeedMinKobo: num("spin_winner_feed_min_kobo"),
    winnerFeedLimit: Math.max(1, num("spin_winner_feed_limit")),
    pushTicketEarned: bool("spin_push_ticket_earned"),
    pushExpiryNudge: bool("spin_push_expiry_nudge"),
    pushExpiryWindowHours: Math.max(1, num("spin_push_expiry_window_hours")),
    pushAnytimeReady: bool("spin_push_anytime_ready"),
  }
}

/** The loyalty tier used for tier bonuses. Today that is users.tier ('retail' | 'reseller'); swap this one function when loyalty tiers land. */
export async function getUserTierKey(userId: string, nativeDB?: any): Promise<string> {
  const result = await d1Query("SELECT tier FROM users WHERE id = ?", [userId], nativeDB)
  return result.results?.[0]?.tier ?? "retail"
}

export interface TierBonus {
  extraTickets: number
  weightBoostPercent: number
}

/** Source-specific row wins over the '*' (every source) row. */
export async function getTierBonus(userId: string, sourceKey: string, nativeDB?: any): Promise<TierBonus> {
  const tierKey = await getUserTierKey(userId, nativeDB)
  const result = await d1Query(
    "SELECT source_key, extra_tickets, weight_boost_percent FROM spin_tier_bonuses WHERE tier_key = ? AND is_active = 1 AND source_key IN (?, '*')",
    [tierKey, sourceKey],
    nativeDB,
  )
  const rows = result.results ?? []
  const row = rows.find((r: any) => r.source_key === sourceKey) ?? rows.find((r: any) => r.source_key === "*")
  return { extraTickets: row?.extra_tickets ?? 0, weightBoostPercent: row?.weight_boost_percent ?? 0 }
}

/** Expected cost of one spin on this table (kobo), from the relative weights. Used by the admin readout. */
export function expectedCostKobo(prizes: Pick<SpinPrize, "weight" | "costKobo" | "isActive">[]): number {
  const active = prizes.filter((p) => p.isActive && p.weight > 0)
  const total = active.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return 0
  return Math.round(active.reduce((s, p) => s + p.weight * p.costKobo, 0) / total)
}

/** Chance (0-100) that a spin on this table wins something. */
export function winChancePercent(prizes: Pick<SpinPrize, "weight" | "prizeType" | "isActive">[]): number {
  const active = prizes.filter((p) => p.isActive && p.weight > 0)
  const total = active.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return 0
  const wins = active.filter((p) => p.prizeType !== "nothing").reduce((s, p) => s + p.weight, 0)
  return Math.round((wins / total) * 1000) / 10
}
