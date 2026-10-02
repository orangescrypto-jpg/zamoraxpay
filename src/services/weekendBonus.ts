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
// There is no automatic cron for this — an admin manually triggers a
// payout run from the admin panel (see
// app/api/admin/weekend-bonus/route.ts and
// app/(admin)/admin/weekend-bonus/page.tsx), which calls
// runWeekendBonusForToday() below.
//
// Idempotency: each user can only be credited once per "period" (one
// calendar day, identified by an ISO date string) via a UNIQUE
// (user_id, period_key) row in weekend_bonus_payouts. If an admin
// clicks "run" more than once on the same day, later runs are no-ops
// for anyone already paid.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { creditWallet } from "@/src/services/wallet"
import { getSetting, getSettingNumber } from "@/src/services/siteSettings"
import { isFeatureEnabled } from "@/src/services/config"
import { runInChunks } from "@/lib/concurrency"

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
 * Runs the weekend bonus for "today" (UTC) — triggered on demand from
 * the admin panel (there is no automatic cron for this). Pays every
 * active user the configured amount, skipping anyone already paid for
 * today's period key. Safe to call more than once per day; repeat
 * calls just report skippedCount instead of double-crediting.
 *
 * options.ignoreDayCheck lets an admin force a run on a non-weekend
 * day (e.g. to pay it a day early, or re-run a day that was missed).
 * The flag/amount checks and the per-user idempotency guard still
 * apply either way — this only bypasses the "is today a configured
 * weekend day" gate.
 */
export async function runWeekendBonusForToday(
  nativeDB?: any,
  date: Date = new Date(),
  options?: { ignoreDayCheck?: boolean },
): Promise<WeekendBonusRunResult> {
  if (!(await isFeatureEnabled("weekend_bonus", nativeDB))) {
    return { ran: false, reason: "Weekend bonus is currently disabled" }
  }

  if (!options?.ignoreDayCheck && !(await isTodayWeekendBonusDay(nativeDB, date))) {
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

  // src/services/weekendBonus.ts — runWeekendBonusForToday()
  // Was: `SELECT id FROM users WHERE status = 'active'` with no LIMIT,
  // feeding a sequential per-user loop (idempotency insert + wallet
  // credit). Highest-stakes risk found in the project: real money,
  // no row cap, and this function has no external cron — the only
  // way it runs is an admin's manual "Run Now" click, which would be
  // the thing timing out on a non-trivial active-user base. Changed
  // to bounded concurrent chunks (15/chunk) via runInChunks. The
  // insert-first idempotency check is kept as-is — it's correct and
  // safe to chunk since each user's UNIQUE(user_id, period_key) row
  // is independent of its siblings.
  const results = await runInChunks(users, 15, async (user) => {
    try {
      await d1Query(
        "INSERT INTO weekend_bonus_payouts (id, user_id, period_key, amount_kobo) VALUES (?, ?, ?, ?)",
        [randomUUID(), user.id, periodKey, amountKobo],
        nativeDB,
      )
    } catch {
      // UNIQUE constraint failed — this user was already paid for
      // this period, most likely by an earlier run of the same cron.
      return "skipped" as const
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
    return "paid" as const
  })

  let paidCount = 0
  let skippedCount = 0
  for (const r of results) {
    if (r.result === "paid") paidCount++
    else skippedCount++
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
