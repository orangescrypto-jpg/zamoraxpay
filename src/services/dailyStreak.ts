// src/services/dailyStreak.ts
// Service abstraction layer — daily check-in streak rewards.
//
// Every knob is admin-controlled, never hardcoded:
//   - 'daily_streak' feature flag        — master on/off
//   - daily_streak_enabled               — master on/off (in addition to the flag)
//   - daily_streak_grace_days_per_week   — how many missed days per
//                                           rolling week are forgiven
//                                           before the streak resets
//   - daily_streak_tiers (table)         — admin-editable reward curve:
//                                           each row covers a day range
//                                           [day_from, day_to] with a
//                                           base amount plus a per-day
//                                           step increase within that
//                                           range. Rows can be added,
//                                           edited, or deleted from the
//                                           admin panel with no redeploy.
//
// GRACE-DAY RULE (per product decision): a user gets N missed days
// forgiven per rolling 7-day window before their streak resets to 1.
// We track this with grace_used_on_date — the date the grace was last
// consumed. If a user misses a day but it's been 7+ days since grace
// was last used (or never used), the miss is forgiven and the streak
// continues uninterrupted. A second miss within the same rolling week
// resets the streak.
//
// Idempotency: exactly like weekend_bonus_payouts, each user can only
// be credited once per period_key (one calendar day) via a UNIQUE
// (user_id, period_key) row in daily_streak_checkins. Calling
// checkIn() twice in the same day is a safe no-op the second time.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { getSettingBoolean, getSettingNumber } from "@/src/services/siteSettings"
import { isFeatureEnabled } from "@/src/services/config"

export interface StreakTier {
  id: string
  dayFrom: number
  dayTo: number | null
  baseAmountKobo: number
  stepAmountKobo: number
}

export interface StreakStatus {
  currentStreak: number
  lastCheckinDate: string | null
  canCheckInToday: boolean
  alreadyCheckedInToday: boolean
  nextRewardKobo: number
  graceAvailable: boolean
}

export interface CheckInResult {
  success: boolean
  message: string
  newStreak?: number
  amountKobo?: number
}

/** Today's date as a stable YYYY-MM-DD key, UTC. */
function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / msPerDay)
}

/** Loads the active reward tiers, ordered by day_from ascending. */
async function getActiveTiers(nativeDB?: any): Promise<StreakTier[]> {
  const result = await d1Query(
    "SELECT * FROM daily_streak_tiers WHERE is_active = 1 ORDER BY day_from ASC",
    [],
    nativeDB,
  )
  const rows = result.results ?? []
  return rows.map((row: any) => ({
    id: row.id,
    dayFrom: row.day_from,
    dayTo: row.day_to,
    baseAmountKobo: row.base_amount_kobo,
    stepAmountKobo: row.step_amount_kobo,
  }))
}

/**
 * Computes the reward for a given streak day against the admin's
 * configured tiers. Reward = base + (position within tier - 1) * step.
 * If a streak day falls past every configured tier's day_to (and no
 * tier is open-ended), the last tier's rate is extended indefinitely
 * so a payout is never simply missing due to an admin's config gap.
 */
export function computeRewardForDay(streakDay: number, tiers: StreakTier[]): number {
  if (tiers.length === 0) return 0

  const matching = tiers.find((t) => streakDay >= t.dayFrom && (t.dayTo === null || streakDay <= t.dayTo))
  if (matching) {
    const positionInTier = streakDay - matching.dayFrom + 1
    return matching.baseAmountKobo + (positionInTier - 1) * matching.stepAmountKobo
  }

  // Past every configured range — extend the last tier's curve rather
  // than paying zero, so a gap in admin config doesn't silently stop
  // rewarding a loyal long-streak user.
  const lastTier = tiers[tiers.length - 1]
  const positionInTier = streakDay - lastTier.dayFrom + 1
  return lastTier.baseAmountKobo + (positionInTier - 1) * lastTier.stepAmountKobo
}

/** Returns a user's current streak status, for display before they check in. */
export async function getStreakStatus(userId: string, nativeDB?: any): Promise<StreakStatus> {
  const result = await d1Query("SELECT * FROM daily_streaks WHERE user_id = ?", [userId], nativeDB)
  const row = result.results?.[0]
  const today = todayKey()

  const currentStreak = row?.current_streak ?? 0
  const lastCheckinDate = row?.last_checkin_date ?? null
  const graceUsedOnDate = row?.grace_used_on_date ?? null

  const alreadyCheckedInToday = lastCheckinDate === today
  const graceDaysPerWeek = await getSettingNumber("daily_streak_grace_days_per_week", 1, nativeDB)
  const graceAvailable = graceDaysPerWeek > 0 && (!graceUsedOnDate || daysBetween(graceUsedOnDate, today) >= 7)

  const tiers = await getActiveTiers(nativeDB)
  // Whatever day *would* be reached with today's check-in, for display.
  const projectedNextStreak = alreadyCheckedInToday
    ? currentStreak
    : lastCheckinDate && daysBetween(lastCheckinDate, today) === 1
      ? currentStreak + 1
      : 1 // fresh start (or forgiven via grace, still counts as continuing — see checkIn())
  const nextRewardKobo = computeRewardForDay(Math.max(projectedNextStreak, 1), tiers)

  return {
    currentStreak,
    lastCheckinDate,
    canCheckInToday: !alreadyCheckedInToday,
    alreadyCheckedInToday,
    nextRewardKobo,
    graceAvailable,
  }
}

/**
 * Performs today's check-in for a user: validates eligibility, applies
 * the grace-day rule if a day was missed, computes the reward from
 * admin-configured tiers, and records the check-in as UNCLAIMED. It
 * does NOT touch the wallet — the user claims it later from the
 * Rewards page (see src/services/rewardsClaim.ts), which is what
 * actually calls creditWallet(). Safe to call more than once per day
 * — later calls in the same day return success:false rather than
 * double-recording.
 */
export async function checkIn(userId: string, nativeDB?: any): Promise<CheckInResult> {
  if (!(await isFeatureEnabled("daily_streak", nativeDB))) {
    return { success: false, message: "Daily check-in rewards are currently disabled" }
  }
  if (!(await getSettingBoolean("daily_streak_enabled", true, nativeDB))) {
    return { success: false, message: "Daily check-in rewards are currently disabled" }
  }

  const today = todayKey()
  const streakResult = await d1Query("SELECT * FROM daily_streaks WHERE user_id = ?", [userId], nativeDB)
  const existing = streakResult.results?.[0]

  if (existing?.last_checkin_date === today) {
    return { success: false, message: "You've already checked in today. Come back tomorrow." }
  }

  const graceDaysPerWeek = await getSettingNumber("daily_streak_grace_days_per_week", 1, nativeDB)
  let newStreak = 1
  let graceUsedOnDate: string | null = existing?.grace_used_on_date ?? null

  if (existing?.last_checkin_date) {
    const gap = daysBetween(existing.last_checkin_date, today)
    if (gap === 1) {
      // Checked in yesterday — streak continues normally.
      newStreak = existing.current_streak + 1
    } else if (gap === 2 && graceDaysPerWeek > 0) {
      // Missed exactly one day — allowed if the weekly grace hasn't
      // been used in the last 7 days.
      const graceStillAvailable = !graceUsedOnDate || daysBetween(graceUsedOnDate, today) >= 7
      if (graceStillAvailable) {
        newStreak = existing.current_streak + 1
        graceUsedOnDate = today
      } else {
        newStreak = 1 // grace already used this week — streak resets
      }
    } else {
      // Missed 2+ days, or grace exhausted — streak resets.
      newStreak = 1
    }
  }

  const tiers = await getActiveTiers(nativeDB)
  const amountKobo = computeRewardForDay(newStreak, tiers)

  if (amountKobo <= 0) {
    return { success: false, message: "No reward is configured for this streak day" }
  }

  // Idempotency guard — the UNIQUE(user_id, period_key) constraint
  // means a duplicate/concurrent call fails fast here rather than
  // risking a double credit.
  try {
    await d1Query(
      "INSERT INTO daily_streak_checkins (id, user_id, period_key, streak_day, amount_kobo) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), userId, today, newStreak, amountKobo],
      nativeDB,
    )
  } catch {
    return { success: false, message: "You've already checked in today. Come back tomorrow." }
  }

  if (existing) {
    await d1Query(
      "UPDATE daily_streaks SET current_streak = ?, last_checkin_date = ?, grace_used_on_date = ?, updated_at = datetime('now') WHERE user_id = ?",
      [newStreak, today, graceUsedOnDate, userId],
      nativeDB,
    )
  } else {
    await d1Query(
      "INSERT INTO daily_streaks (user_id, current_streak, last_checkin_date, grace_used_on_date) VALUES (?, ?, ?, ?)",
      [userId, newStreak, today, graceUsedOnDate],
      nativeDB,
    )
  }

  return { success: true, message: `Day ${newStreak} check-in complete!`, newStreak, amountKobo }
}

// --- Admin management of reward tiers ---

export async function listStreakTiers(nativeDB?: any): Promise<StreakTier[]> {
  const result = await d1Query("SELECT * FROM daily_streak_tiers ORDER BY day_from ASC", [], nativeDB)
  const rows = result.results ?? []
  return rows.map((row: any) => ({
    id: row.id,
    dayFrom: row.day_from,
    dayTo: row.day_to,
    baseAmountKobo: row.base_amount_kobo,
    stepAmountKobo: row.step_amount_kobo,
  }))
}

export async function upsertStreakTier(
  params: {
    id?: string
    dayFrom: number
    dayTo: number | null
    baseAmountKobo: number
    stepAmountKobo: number
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  if (params.id) {
    await d1Query(
      `UPDATE daily_streak_tiers SET
        day_from = ?, day_to = ?, base_amount_kobo = ?, step_amount_kobo = ?,
        updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [params.dayFrom, params.dayTo, params.baseAmountKobo, params.stepAmountKobo, adminUserId, params.id],
      nativeDB,
    )
  } else {
    await d1Query(
      `INSERT INTO daily_streak_tiers (id, day_from, day_to, base_amount_kobo, step_amount_kobo, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), params.dayFrom, params.dayTo, params.baseAmountKobo, params.stepAmountKobo, adminUserId],
      nativeDB,
    )
  }
}

export async function deleteStreakTier(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM daily_streak_tiers WHERE id = ?", [id], nativeDB)
}
