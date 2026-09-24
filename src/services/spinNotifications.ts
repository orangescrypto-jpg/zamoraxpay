// src/services/spinNotifications.ts
// Service abstraction layer — scheduled Spin & Win housekeeping.
// Run by /api/cron/spin (safe to run hourly; every push is idempotent per
// user per day through push_notification_log, same table the other comeback
// triggers use).

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { sendPushToUser } from "@/src/services/pushNotifications"
import { addHours, dayKeyOf, getSource, getSpinSettings, isSpinEnabled, isWithinWindow, sqlTime, weekdayNameOf, parseWeekdays } from "@/src/services/spinConfig"

/** Inserts the (user, trigger, day) log row. Returns false if it already existed = already nudged today. */
async function claimSlot(userId: string, triggerKey: string, periodKey: string, nativeDB?: any): Promise<boolean> {
  try {
    await d1Query(
      "INSERT INTO push_notification_log (id, user_id, trigger_key, period_key) VALUES (?, ?, ?, ?)",
      [randomUUID(), userId, triggerKey, periodKey],
      nativeDB,
    )
    return true
  } catch {
    return false
  }
}

export interface SpinCronResult {
  ticketsExpired: number
  vouchersExpired: number
  expiryNudges: number
  readyNudges: number
}

export async function runSpinCron(nativeDB?: any): Promise<SpinCronResult> {
  const result: SpinCronResult = { ticketsExpired: 0, vouchersExpired: 0, expiryNudges: 0, readyNudges: 0 }
  const now = new Date()
  const nowSql = sqlTime(now)

  // Housekeeping: tidy statuses. (Spinning already ignores expired tickets by date; this is for reports.)
  const t = await d1Query("UPDATE spin_tickets SET status = 'expired' WHERE status = 'available' AND expires_at <= ? RETURNING id", [nowSql], nativeDB)
  result.ticketsExpired = t.results?.length ?? 0
  const v = await d1Query("UPDATE spin_vouchers SET status = 'expired' WHERE status = 'active' AND expires_at <= ? RETURNING id", [nowSql], nativeDB)
  result.vouchersExpired = v.results?.length ?? 0

  if (!(await isSpinEnabled(nativeDB))) return result
  const settings = await getSpinSettings(nativeDB)
  const today = dayKeyOf(now)

  // "Your spin is about to expire" — users still holding an unused ticket that ends soon.
  if (settings.pushExpiryNudge) {
    const soon = sqlTime(addHours(now, settings.pushExpiryWindowHours))
    // Only tickets that are usable right now inside their OWN source's schedule,
    // judged by the earlier of the ticket's expiry and its source's end time.
    const rows = await d1Query(
      `SELECT t.user_id, COUNT(*) AS n
         FROM spin_tickets t JOIN spin_sources s ON s.source_key = t.source_key
        WHERE t.status = 'available' AND s.is_enabled = 1
          AND (s.starts_at IS NULL OR s.starts_at <= ?) AND (s.ends_at IS NULL OR s.ends_at >= ?)
          AND MIN(t.expires_at, COALESCE(s.ends_at, t.expires_at)) > ?
          AND MIN(t.expires_at, COALESCE(s.ends_at, t.expires_at)) <= ?
        GROUP BY t.user_id LIMIT 1000`,
      [nowSql, nowSql, nowSql, soon],
      nativeDB,
    )
    for (const r of rows.results ?? []) {
      if (!(await claimSlot(r.user_id, "spin_expiring", today, nativeDB))) continue
      const sent = await sendPushToUser(
        r.user_id,
        {
          title: r.n > 1 ? `${r.n} spins expire soon ⏳` : "Your spin expires soon ⏳",
          body: "Unused spins disappear. Open the app and spin before it's gone!",
          url: "/dashboard",
          tag: "spin-expiring",
        },
        nativeDB,
      ).catch(() => 0)
      if (sent > 0) result.expiryNudges++
    }
  }

  // "Your free spin is ready" — one nudge PER SOURCE, only while that source is inside its
  // own schedule, only to users who haven't used THAT source today. One source's window or
  // usage never triggers or suppresses another's.
  if (settings.pushAnytimeReady) {
    for (const key of ["anytime", "weekend", "scratch_card", "pick_a_card"] as const) {
      const s = await getSource(key, nativeDB)
      if (!s?.isEnabled || !isWithinWindow(s, now)) continue
      if (key === "weekend" && !parseWeekdays(s.config.active_weekdays).includes(weekdayNameOf(now).toLowerCase())) continue
      const rows = await d1Query(
        `SELECT DISTINCT p.user_id FROM push_subscriptions p
          WHERE p.user_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM spin_spins x WHERE x.user_id = p.user_id AND x.day_key = ? AND x.source_key = ?)
          LIMIT 500`,
        [today, key],
        nativeDB,
      )
      for (const r of rows.results ?? []) {
        if (!(await claimSlot(r.user_id, `spin_daily_ready:${key}`, today, nativeDB))) continue
        const sent = await sendPushToUser(
          r.user_id,
          { title: `${s.label} is ready 🎡`, body: "Open the app and play before it expires.", url: "/dashboard", tag: `spin-ready-${key}` },
          nativeDB,
        ).catch(() => 0)
        if (sent > 0) result.readyNudges++
      }
    }
  }

  return result
}
