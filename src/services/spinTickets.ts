// src/services/spinTickets.ts
// Service abstraction layer — spin ticket issuing.
//
// A ticket is the right to ONE spin. Tickets come from the sources in
// spin_sources (streak milestone, anytime, purchase, deposit, referral,
// first purchase of the day, monthly spend milestone, weekend, admin gift).
//
// GUARANTEES
//  - Idempotent: every ticket has a UNIQUE issue_key (e.g. 'purchase:<orderId>#0'),
//    so re-running a hook (webhook retry, cron re-run, double tap) can never
//    mint a second ticket for the same event.
//  - Per-day cap is enforced INSIDE the insert statement (not read-then-write),
//    so two simultaneous requests cannot both slip under the cap.
//  - Every hook here is best-effort and NEVER throws: a spin problem must
//    never fail a purchase, a deposit, a referral or a daily check-in.
//  - Unspent = gone. Each ticket carries an admin-set expiry (end of the UTC
//    day by default, or N hours) — expired tickets can no longer be spun.

import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { sendPushToUser } from "@/src/services/pushNotifications"
import {
  dayKeyOf,
  computeExpiry,
  getSource,
  getSpinSettings,
  getTierBonus,
  isSpinEnabled,
  isWithinWindow,
  parseIntList,
  parseWeekdays,
  sqlTime,
  weekdayNameOf,
  SPIN_SOURCE_META,
  type SpinSource,
  type SpinSourceKey,
} from "@/src/services/spinConfig"

export interface IssueTicketsParams {
  userId: string
  sourceKey: SpinSourceKey
  /** Idempotency base. Same base + same index = same ticket. */
  issueKey: string
  /** Overrides the source's tickets_per_award (used by lazy daily sources). */
  count?: number
  /** Push "you earned a spin" (skipped for silent lazy tickets). Default true. */
  notify?: boolean
  note?: string
}

/**
 * Issues tickets for a source, honouring: master switch, source on/off,
 * availability window, tier bonus, per-day cap, and expiry. Returns how
 * many NEW tickets were actually created (0 when duplicate / capped / off).
 */
export async function issueTickets(params: IssueTicketsParams, nativeDB?: any): Promise<number> {
  if (!(await isSpinEnabled(nativeDB))) return 0

  const source = await getSource(params.sourceKey, nativeDB)
  if (!source || !source.isEnabled) return 0

  const now = new Date()
  if (!isWithinWindow(source, now)) return 0

  const bonus = await getTierBonus(params.userId, params.sourceKey, nativeDB)
  const baseCount = Math.max(0, Math.floor(params.count ?? source.ticketsPerAward))
  const count = baseCount + Math.max(0, bonus.extraTickets)
  if (count <= 0) return 0

  // Lazy daily sources can't be "unlimited" (that would mint tickets forever).
  // The cap must never silently truncate what's actually being given today —
  // if an admin raises "Spins given each day" (ticketsPerAward) without also
  // raising "Max spins per day" (spinsPerDay), the count they just set would
  // otherwise vanish behind the old, smaller cap. The cap can still be set
  // HIGHER than the daily give (to allow bonus/admin-gift tickets on top),
  // just never lower than the base count being issued right now.
  const kind = SPIN_SOURCE_META[params.sourceKey].kind
  let cap = source.spinsPerDay
  if (kind === "lazy") cap = Math.max(1, cap, baseCount)
  // Tier bonus tickets are on top of the normal cap, not squeezed inside it.
  const effectiveCap = cap > 0 ? cap + Math.max(0, bonus.extraTickets) : 0

  const today = dayKeyOf(now)
  const expiresAt = computeExpiry(source, now)

  let issued = 0
  for (let i = 0; i < count; i++) {
    const res = await d1Query(
      `INSERT OR IGNORE INTO spin_tickets (id, user_id, source_key, status, issue_key, day_key, expires_at, note)
       SELECT ?, ?, ?, 'available', ?, ?, ?, ?
        WHERE (? = 0 OR (SELECT COUNT(*) FROM spin_tickets WHERE user_id = ? AND source_key = ? AND day_key = ?) < ?)
       RETURNING id`,
      [
        randomUUID(),
        params.userId,
        params.sourceKey,
        `${params.issueKey}#${i}`,
        today,
        expiresAt,
        params.note ?? null,
        effectiveCap,
        params.userId,
        params.sourceKey,
        today,
        effectiveCap,
      ],
      nativeDB,
    )
    if ((res.results?.length ?? 0) > 0) issued++
  }

  if (issued > 0 && params.notify !== false) {
    notifyTicketEarned(params.userId, issued, source, nativeDB).catch((err) =>
      console.error("[spinTickets] push failed:", err),
    )
  }

  return issued
}

async function notifyTicketEarned(userId: string, count: number, source: SpinSource, nativeDB?: any): Promise<void> {
  const settings = await getSpinSettings(nativeDB)
  if (!settings.pushTicketEarned) return
  await sendPushToUser(
    userId,
    {
      title: count > 1 ? `You earned ${count} spins! 🎡` : "You earned a spin! 🎡",
      body: `${source.label}: open the app and spin to win before it expires.`,
      url: "/dashboard",
      tag: "spin-ticket",
    },
    nativeDB,
  )
}

// ── Lazy daily sources (anytime + weekend) ────────────────────────────
// These aren't triggered by anything the user did, so we can't fan out to
// every user at midnight. Instead the ticket is created the first time the
// user loads the dashboard that day. Once spun (or expired) it stays gone
// until the NEXT UTC day — the issue_key includes the date.

export async function ensureLazyTickets(userId: string, nativeDB?: any): Promise<void> {
  if (!(await isSpinEnabled(nativeDB))) return

  const now = new Date()
  const today = dayKeyOf(now)

  for (const key of ["anytime", "weekend", "scratch_card", "pick_a_card"] as SpinSourceKey[]) {
    const source = await getSource(key, nativeDB)
    if (!source || !source.isEnabled || !isWithinWindow(source, now)) continue

    if (key === "weekend") {
      const days = parseWeekdays(source.config.active_weekdays)
      if (!days.includes(weekdayNameOf(now).toLowerCase())) continue
    }

    await issueTickets(
      {
        userId,
        sourceKey: key,
        issueKey: `lazy:${key}:${userId}:${today}`,
        count: Math.max(1, source.ticketsPerAward),
        notify: false,
      },
      nativeDB,
    )
  }
}

// ── Event hooks. Each one swallows its own errors. ────────────────────

/** Call after a successful daily check-in. Returns tickets earned. */
export async function onStreakCheckIn(userId: string, streakDay: number, today: string, nativeDB?: any): Promise<number> {
  try {
    const source = await getSource("streak_milestone", nativeDB)
    if (!source || !source.isEnabled) return 0

    const days = parseIntList(source.config.milestone_days)
    const interval = Math.floor(Number(source.config.milestone_interval) || 0)
    const hit = days.includes(streakDay) || (interval > 0 && streakDay % interval === 0)
    if (!hit) return 0

    return await issueTickets(
      { userId, sourceKey: "streak_milestone", issueKey: `streak:${userId}:${today}`, note: `Day ${streakDay} streak` },
      nativeDB,
    )
  } catch (err) {
    console.error("[spinTickets] streak hook failed:", err)
    return 0
  }
}

/** Call after a purchase is CONFIRMED successful (paid orders only). */
export async function onPurchaseSuccess(
  params: { userId: string; orderId: string; amountKobo: number },
  nativeDB?: any,
): Promise<void> {
  try {
    // Free/voucher-funded orders (amount 0) never earn tickets — otherwise
    // a free prize could feed itself.
    if (params.amountKobo <= 0) return
    if (!(await isSpinEnabled(nativeDB))) return

    const now = new Date()
    const today = dayKeyOf(now)

    const purchase = await getSource("purchase", nativeDB)
    if (purchase?.isEnabled) {
      const min = Number(purchase.config.min_amount_kobo) || 0
      if (params.amountKobo >= min) {
        await issueTickets({ userId: params.userId, sourceKey: "purchase", issueKey: `purchase:${params.orderId}` }, nativeDB)
      }
    }

    const mysteryBox = await getSource("mystery_box", nativeDB)
    if (mysteryBox?.isEnabled) {
      const min = Number(mysteryBox.config.min_amount_kobo) || 0
      if (params.amountKobo >= min) {
        await issueTickets({ userId: params.userId, sourceKey: "mystery_box", issueKey: `mystery_box:${params.orderId}` }, nativeDB)
      }
    }

    const first = await getSource("first_purchase_of_day", nativeDB)
    if (first?.isEnabled) {
      const min = Number(first.config.min_amount_kobo) || 0
      if (params.amountKobo >= min) {
        // Same base key all day → only the first qualifying purchase creates tickets.
        await issueTickets(
          { userId: params.userId, sourceKey: "first_purchase_of_day", issueKey: `fpod:${params.userId}:${today}` },
          nativeDB,
        )
      }
    }

    const spend = await getSource("spend_milestone", nativeDB)
    if (spend?.isEnabled) {
      const targets = parseIntList(spend.config.targets_kobo)
      if (targets.length > 0) {
        const monthKey = today.slice(0, 7)
        const monthStart = `${monthKey}-01 00:00:00`
        const totalResult = await d1Query(
          "SELECT COALESCE(SUM(amount_kobo), 0) AS total FROM vtu_orders WHERE user_id = ? AND status = 'success' AND created_at >= ?",
          [params.userId, monthStart],
          nativeDB,
        )
        const spent = totalResult.results?.[0]?.total ?? 0
        for (const target of targets) {
          if (spent >= target) {
            await issueTickets(
              {
                userId: params.userId,
                sourceKey: "spend_milestone",
                issueKey: `spend:${params.userId}:${monthKey}:${target}`,
                note: `Spent ₦${(target / 100).toLocaleString()} this month`,
              },
              nativeDB,
            )
          }
        }
      }
    }
  } catch (err) {
    console.error("[spinTickets] purchase hook failed:", err)
  }
}

/** Call after a wallet funding has been credited. */
export async function onDepositSuccess(
  params: { userId: string; fundingReference: string; depositAmountKobo: number },
  nativeDB?: any,
): Promise<void> {
  try {
    const source = await getSource("deposit", nativeDB)
    if (!source?.isEnabled) return
    const min = Number(source.config.min_amount_kobo) || 0
    if (params.depositAmountKobo < min) return
    await issueTickets(
      { userId: params.userId, sourceKey: "deposit", issueKey: `deposit:${params.fundingReference}` },
      nativeDB,
    )
  } catch (err) {
    console.error("[spinTickets] deposit hook failed:", err)
  }
}

/** Call when a referral bonus has just been awarded to the referrer. */
export async function onReferralQualified(referrerUserId: string, referralId: string, nativeDB?: any): Promise<void> {
  try {
    await issueTickets(
      { userId: referrerUserId, sourceKey: "referral", issueKey: `referral:${referralId}` },
      nativeDB,
    )
  } catch (err) {
    console.error("[spinTickets] referral hook failed:", err)
  }
}

// ── Reads used by the spin status API ─────────────────────────────────

export interface AvailableTicket {
  id: string
  sourceKey: string
  sourceLabel: string
  expiresAt: string
}

export async function listAvailableTickets(userId: string, nativeDB?: any): Promise<AvailableTicket[]> {
  const result = await d1Query(
    `SELECT t.id, t.source_key, t.expires_at, s.label
       FROM spin_tickets t
       JOIN spin_sources s ON s.source_key = t.source_key
      WHERE t.user_id = ? AND t.status = 'available' AND t.expires_at > ? AND s.is_enabled = 1
      ORDER BY t.expires_at ASC, t.created_at ASC`,
    [userId, sqlTime()],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    id: r.id,
    sourceKey: r.source_key,
    sourceLabel: r.label,
    expiresAt: r.expires_at,
  }))
}
