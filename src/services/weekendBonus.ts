// src/services/weekendBonus.ts
// Service abstraction layer — weekend bonus awarding.
//
// Every knob is admin-controlled, never hardcoded:
//   - 'weekend_bonus' feature flag  — master on/off
//   - weekend_bonus_amount_kobo     — amount credited per qualifying day
//   - weekend_bonus_days            — comma-separated day names that
//                                      count as "weekend" (default
//                                      "Saturday,Sunday"), so an admin
//                                      can widen/narrow it without a
//                                      redeploy or schema change
//
// Meant to be driven by a daily cron job (see
// app/api/cron/weekend-bonus/route.ts): the job calls
// runWeekendBonusForToday() once a day, and this module decides
// whether today qualifies and who gets paid.
//
// Idempotency: each user can only be credited once per "period" (one
// calendar day, identified by an ISO date string) via a UNIQUE
// (user_id, period_key) row in weekend_bonus_payouts. If the cron
// fires more than once on the same day, later calls are no-ops.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { creditWallet } from "@/src/services/wallet"
import { getSetting, getSettingNumber } from "@/src/services/siteSettings"
import { isFeatureEnabled } from "@/src/services/config"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export interface WeekendBonusRunResult {
  ran: boolean
  reason?: string
  periodKey?: string
  amountKobo?: number
  eligibleUsers?: number
  paidCount?: number
  skippedCount?: number
}

/** Returns today's weekday name ("Saturday", "Sunday", ...) for a given date, defaulting to now. */
function todayName(date: Date = new Date()): string {
  return DAY_NAMES[date.getUTCDay()]
}

/** Returns today's date as a stable YYYY-MM-DD period key, used to key idempotency. */
function todayPeriodKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Checks whether today qualifies as a "weekend" day per the admin's
 * configured weekend_bonus_days setting.
 */
export async function isTodayWeekendBonusDay(nativeDB?: any, date: Date = new Date()): Promise<boolean> {
  const configuredDays = (await getSetting("weekend_bonus_days", nativeDB)) ?? "Saturday,Sunday"
  const days = configuredDays.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)
  return days.includes(todayName(date).toLowerCase())
}

/**
 * Runs the weekend bonus for "today" (UTC) — call once a day from the
 * cron job. Pays every active user the configured amount, skipping
 * anyone already paid for today's period key. Safe to call more than
 * once per day; repeat calls just report skippedCount instead of
 * double-crediting.
 */
export async function runWeekendBonusForToday(nativeDB?: any, date: Date = new Date()): Promise<WeekendBonusRunResult> {
  if (!(await isFeatureEnabled("weekend_bonus", nativeDB))) {
    return { ran: false, reason: "Weekend bonus is currently disabled" }
  }

  if (!(await isTodayWeekendBonusDay(nativeDB, date))) {
    return { ran: false, reason: `${todayName(date)} is not a configured weekend bonus day` }
  }

  const amountKobo = await getSettingNumber("weekend_bonus_amount_kobo", 0, nativeDB)
  if (amountKobo <= 0) {
    return { ran: false, reason: "Weekend bonus amount is not configured" }
  }

  const periodKey = todayPeriodKey(date)

  const activeUsers = await d1Query(
    "SELECT id FROM users WHERE status = 'active'",
    [],
    nativeDB,
  )
  const users: Array<{ id: string }> = activeUsers.results ?? []

  let paidCount = 0
  let skippedCount = 0

  for (const user of users) {
    try {
      // The UNIQUE(user_id, period_key) constraint is the real
      // idempotency guard — this insert-first approach means a
      // duplicate cron run fails fast on the DB constraint rather
      // than relying on a slower "check then credit" race.
      await d1Query(
        "INSERT INTO weekend_bonus_payouts (id, user_id, period_key, amount_kobo) VALUES (?, ?, ?, ?)",
        [randomUUID(), user.id, periodKey, amountKobo],
        nativeDB,
      )
    } catch {
      // UNIQUE constraint failed — this user was already paid for
      // this period, most likely by an earlier run of the same cron.
      skippedCount++
      continue
    }

    await creditWallet(
      {
        userId: user.id,
        amountKobo,
        type: "weekend_bonus",
        reference: `ZPWB-${user.id}-${periodKey}`,
        metadata: { periodKey },
      },
      nativeDB,
    )
    paidCount++
  }

  return {
    ran: true,
    periodKey,
    amountKobo,
    eligibleUsers: users.length,
    paidCount,
    skippedCount,
  }
}
