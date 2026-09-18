// src/services/reEngagementNotifications.ts
// Service abstraction layer — comeback/re-engagement push notification
// triggers. Each function below finds the users who currently qualify
// for one nudge and sends it. All of it is cron-driven (see
// app/api/cron/re-engagement/route.ts), not event-driven — nothing
// here fires from a specific user action in the moment.
//
// Every trigger has its own feature flag (feature_flags table) so an
// admin can turn any single nudge off without touching the others,
// plus a per-trigger inactivity/threshold window in site_settings
// where relevant. Idempotency (never spamming the same user the same
// day for the same trigger) is enforced by push_notification_log —
// a UNIQUE (user_id, trigger_key, period_key) row per send.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { isFeatureEnabled } from "@/src/services/config"
import { getSettingNumber } from "@/src/services/siteSettings"
import { sendPushToUser, type PushPayload } from "@/src/services/pushNotifications"

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** Records that a trigger fired for a user today; returns false if it already did (skip send). */
async function claimTriggerSlot(userId: string, triggerKey: string, nativeDB?: any): Promise<boolean> {
  try {
    await d1Query(
      "INSERT INTO push_notification_log (id, user_id, trigger_key, period_key) VALUES (?, ?, ?, ?)",
      [randomUUID(), userId, triggerKey, todayKey()],
      nativeDB,
    )
    return true
  } catch {
    return false
  }
}

async function fireForUsers(
  triggerKey: string,
  userIds: string[],
  buildPayload: (userId: string) => PushPayload,
  nativeDB?: any,
): Promise<{ eligible: number; sent: number }> {
  let sent = 0
  for (const userId of userIds) {
    const claimed = await claimTriggerSlot(userId, triggerKey, nativeDB)
    if (!claimed) continue
    const count = await sendPushToUser(userId, buildPayload(userId), nativeDB)
    if (count > 0) sent++
  }
  return { eligible: userIds.length, sent }
}

// ── 1. Streak at risk ───────────────────────────────────────────────
// Users who checked in yesterday (streak > 0) but haven't checked in
// today yet, and it's past the admin-configured "risk hour" (UTC).
export async function runStreakAtRiskTrigger(nativeDB?: any): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_streak_at_risk", nativeDB))) return { eligible: 0, sent: 0 }

  const today = todayKey()
  const yesterday = todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const result = await d1Query(
    `SELECT user_id, current_streak FROM daily_streaks
     WHERE last_checkin_date = ? AND current_streak > 0`,
    [yesterday],
    nativeDB,
  )
  const rows: Array<{ user_id: string; current_streak: number }> = result.results ?? []
  const userIds = rows.map((r) => r.user_id)

  return fireForUsers(
    "streak_at_risk",
    userIds,
    () => ({
      title: "Your streak is about to end! 🔥",
      body: "Check in today to keep your daily streak alive.",
      url: "/rewards",
      tag: `streak-at-risk-${today}`,
    }),
    nativeDB,
  )
}

// ── 2. Unclaimed reward/bonus ───────────────────────────────────────
// Users with unclaimed cashback, referral bonus, or streak reward
// sitting untouched for N+ days (default 3).
export async function runUnclaimedRewardTrigger(nativeDB?: any): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_unclaimed_reward", nativeDB))) return { eligible: 0, sent: 0 }

  const minAgeDays = await getSettingNumber("push_unclaimed_reward_min_age_days", 3, nativeDB)
  const cutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000).toISOString()

  const [cashback, referral, streak] = await Promise.all([
    d1Query(
      "SELECT DISTINCT user_id FROM cashback_awards WHERE claimed = 0 AND created_at <= ?",
      [cutoff],
      nativeDB,
    ),
    d1Query(
      "SELECT DISTINCT referrer_user_id AS user_id FROM referrals WHERE bonus_awarded = 1 AND claimed = 0 AND awarded_at <= ?",
      [cutoff],
      nativeDB,
    ),
    d1Query(
      "SELECT DISTINCT user_id FROM daily_streak_checkins WHERE claimed = 0 AND created_at <= ?",
      [cutoff],
      nativeDB,
    ),
  ])

  const userIds = Array.from(
    new Set([
      ...(cashback.results ?? []).map((r: any) => r.user_id),
      ...(referral.results ?? []).map((r: any) => r.user_id),
      ...(streak.results ?? []).map((r: any) => r.user_id),
    ]),
  )

  return fireForUsers(
    "unclaimed_reward",
    userIds,
    () => ({
      title: "You have a reward waiting 🎁",
      body: "You've earned a reward that hasn't been claimed yet. Grab it before it slips your mind.",
      url: "/rewards",
      tag: "unclaimed-reward",
    }),
    nativeDB,
  )
}

// ── 3. Wallet balance idle ──────────────────────────────────────────
// Users with a funded wallet (balance above a minimum) and no
// purchase (vtu_orders row) in N+ days (default 5).
export async function runWalletIdleTrigger(nativeDB?: any): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_wallet_idle", nativeDB))) return { eligible: 0, sent: 0 }

  const minBalanceKobo = await getSettingNumber("push_wallet_idle_min_balance_kobo", 50000, nativeDB)
  const inactivityDays = await getSettingNumber("push_wallet_idle_days", 5, nativeDB)
  const cutoff = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString()

  const result = await d1Query(
    `SELECT w.user_id FROM wallets w
     WHERE w.balance_kobo >= ?
       AND NOT EXISTS (
         SELECT 1 FROM vtu_orders o
         WHERE o.user_id = w.user_id AND o.created_at > ?
       )`,
    [minBalanceKobo, cutoff],
    nativeDB,
  )
  const userIds = (result.results ?? []).map((r: any) => r.user_id)

  return fireForUsers(
    "wallet_idle",
    userIds,
    () => ({
      title: "Your wallet is funded and ready",
      body: "You've got funds sitting in your wallet — top up airtime or data whenever you're ready.",
      url: "/dashboard",
      tag: "wallet-idle",
    }),
    nativeDB,
  )
}

// ── 4. Weekend bonus live ───────────────────────────────────────────
// Fires once, the moment an admin runs the weekend bonus payout — see
// runWeekendBonusForToday() in weekendBonus.ts, which is the actual
// trigger source (an admin action, not a cron condition). This
// function instead handles the cron-friendly variant: notify anyone
// who was PAID today's weekend bonus but hasn't opened the app since.
// Kept simple: notify everyone paid today, once.
export async function runWeekendBonusLiveTrigger(nativeDB?: any): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_weekend_bonus_live", nativeDB))) return { eligible: 0, sent: 0 }

  const today = todayKey()
  const result = await d1Query(
    "SELECT user_id FROM weekend_bonus_payouts WHERE period_key = ?",
    [today],
    nativeDB,
  )
  const userIds = (result.results ?? []).map((r: any) => r.user_id)

  return fireForUsers(
    "weekend_bonus_live",
    userIds,
    () => ({
      title: "Weekend bonus is in your wallet! 🎉",
      body: "Your weekend bonus just landed. Spend it on airtime, data, or bills.",
      url: "/dashboard",
      tag: `weekend-bonus-${today}`,
    }),
    nativeDB,
  )
}

// ── 5. Referral nudge ───────────────────────────────────────────────
// Users with a referral_code who have made zero referrals — nudged
// periodically (every N days, default 7, tracked via the log table)
// to share their code.
export async function runReferralNudgeTrigger(nativeDB?: any): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_referral_nudge", nativeDB))) return { eligible: 0, sent: 0 }

  const result = await d1Query(
    `SELECT u.id AS user_id FROM users u
     WHERE u.referral_code IS NOT NULL
       AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM referrals r WHERE r.referrer_user_id = u.id)`,
    [],
    nativeDB,
  )
  const userIds = (result.results ?? []).map((r: any) => r.user_id)

  return fireForUsers(
    "referral_nudge",
    userIds,
    () => ({
      title: "Earn by inviting friends",
      body: "Share your referral code and earn a bonus for every friend who joins.",
      url: "/referrals",
      tag: "referral-nudge",
    }),
    nativeDB,
  )
}

// ── 6. Inactivity win-back ──────────────────────────────────────────
// No login/purchase signal in N days. We use vtu_orders and
// wallet_transactions as the activity proxy (there's no separate
// login-log table) — last activity = most recent row across either.
// Runs at three thresholds (7, 14, 30 days), each its own trigger key
// so a user isn't re-notified at every threshold on the same day and
// each stage can be worded differently.
const WINBACK_STAGES = [
  { days: 7, key: "winback_7", title: "We miss you 👋", body: "It's been a week — come back and top up in seconds." },
  { days: 14, key: "winback_14", title: "Still there?", body: "Your account's been quiet for 2 weeks. Everything okay?" },
  { days: 30, key: "winback_30", title: "It's been a while", body: "A month since your last visit — your wallet's still here whenever you're ready." },
] as const

export async function runInactivityWinBackTrigger(
  nativeDB?: any,
): Promise<{ eligible: number; sent: number }> {
  if (!(await isFeatureEnabled("push_inactivity_winback", nativeDB))) return { eligible: 0, sent: 0 }

  let totalEligible = 0
  let totalSent = 0

  for (const stage of WINBACK_STAGES) {
    const cutoff = new Date(Date.now() - stage.days * 24 * 60 * 60 * 1000).toISOString()
    // "Inactive since exactly this window" — active more recently than
    // the cutoff excludes them; but if they were also inactive at an
    // earlier (smaller-day) stage they'd already have been claimed by
    // that stage's trigger key, so no double-fire across stages.
    const result = await d1Query(
      `SELECT u.id AS user_id FROM users u
       WHERE u.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM vtu_orders o WHERE o.user_id = u.id AND o.created_at > ?)
         AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.user_id = u.id AND t.created_at > ?)`,
      [cutoff, cutoff],
      nativeDB,
    )
    const userIds = (result.results ?? []).map((r: any) => r.user_id)

    const { eligible, sent } = await fireForUsers(
      stage.key,
      userIds,
      () => ({ title: stage.title, body: stage.body, url: "/dashboard", tag: stage.key }),
      nativeDB,
    )
    totalEligible += eligible
    totalSent += sent
  }

  return { eligible: totalEligible, sent: totalSent }
}

/** Runs every re-engagement trigger once, for the daily cron job. */
export async function runAllReEngagementTriggers(nativeDB?: any) {
  const [streakAtRisk, unclaimedReward, walletIdle, weekendBonusLive, referralNudge, inactivityWinback] =
    await Promise.all([
      runStreakAtRiskTrigger(nativeDB),
      runUnclaimedRewardTrigger(nativeDB),
      runWalletIdleTrigger(nativeDB),
      runWeekendBonusLiveTrigger(nativeDB),
      runReferralNudgeTrigger(nativeDB),
      runInactivityWinBackTrigger(nativeDB),
    ])

  return { streakAtRisk, unclaimedReward, walletIdle, weekendBonusLive, referralNudge, inactivityWinback }
}
