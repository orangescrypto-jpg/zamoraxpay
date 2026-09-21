// src/services/spinEngine.ts
// Service abstraction layer — the spin itself.
//
// HOW A SPIN WORKS (all server-side; the browser only animates a result
// that was already decided and saved):
//   1. Anti-abuse checks (per-user daily cap, per-device / per-IP limits).
//   2. The ticket is CONSUMED with one guarded UPDATE ... RETURNING, so a
//      double-tap or two racing requests can never spend one ticket twice.
//   3. The prize is drawn by weight from that ticket's source's OWN prize
//      table, after removing prizes that hit their daily/weekly win cap or
//      would break the daily budget, and after applying the loyalty-tier
//      odds boost. If the user is due a guaranteed prize (N losses in a row)
//      the draw is limited to the guarantee pool.
//   4. The result row is inserted with the cap + budget checks INSIDE the
//      INSERT statement, so simultaneous winners cannot overshoot a jackpot
//      cap or the daily budget. If the guard rejects, the draw is retried
//      without that prize.
//   5. The prize is fulfilled: wallet credit (type 'spin_reward' — spend-only,
//      never withdrawable), a voucher/coupon row, or a streak shield.
//      Fulfilment is idempotent and retried automatically if it fails.
//   Prize settings are SNAPSHOTTED onto the spin row, so editing or deleting
//   a prize later never changes something a user already won.

import { randomInt, randomUUID, createHash } from "crypto"
import { d1Query } from "@/lib/d1"
import { creditWallet } from "@/src/services/wallet"
import { addProtectionTokens } from "@/src/services/streakProtection"
import {
  addDays,
  dayKeyOf,
  fromSqlTime,
  getSource,
  getSpinSettings,
  getTierBonus,
  isSpinEnabled,
  listPrizes,
  mapPrize,
  safeJson,
  sqlTime,
  type SpinPrize,
  type SpinPrizeType,
  type SpinSource,
} from "@/src/services/spinConfig"
import { ensureLazyTickets, listAvailableTickets, type AvailableTicket } from "@/src/services/spinTickets"

const MAX_WEIGHT = 1_000_000

// ── Public shapes ─────────────────────────────────────────────────────

/** What the browser is allowed to know about a prize: enough to draw the wheel, never the odds. */
export interface WheelSegment {
  id: string
  label: string
  type: SpinPrizeType
  amountKobo: number
  color: string | null
  isJackpot: boolean
}

export interface SpinStatus {
  enabled: boolean
  popupEnabled: boolean
  winnersEnabled: boolean
  tickets: AvailableTicket[]
  /** Wheel layout per source key, only for sources the user currently holds a ticket for. */
  wheels: Record<string, WheelSegment[]>
  nextExpiresAt: string | null
  activeVouchers: number
  activeCoupons: number
  /** null = no daily limit configured. */
  spinsLeftToday: number | null
}

export interface SpinOutcome {
  spinId: string
  /** The segment to land on. null = no matching segment (client lands on a "nothing" slice). */
  prizeId: string | null
  prizeLabel: string
  prizeType: SpinPrizeType
  amountKobo: number
  wasGuarantee: boolean
  ticketsLeft: number
  message: string
}

export type PerformSpinResult = { ok: true; outcome: SpinOutcome } | { ok: false; message: string; status: number }

export function toSegment(p: SpinPrize): WheelSegment {
  return { id: p.id, label: p.label, type: p.prizeType, amountKobo: p.amountKobo, color: p.color, isJackpot: p.isJackpot }
}

/** One-way hash for the anti-farming checks — raw IPs / user agents are never stored. */
export function hashForAbuse(value: string): string {
  const salt = process.env.SPIN_HASH_SALT || process.env.CRON_SECRET || "zamoraxpay-spin"
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32)
}

// ── Status (what the dashboard asks for) ──────────────────────────────

export async function getSpinStatus(userId: string, nativeDB?: any): Promise<SpinStatus> {
  const empty: SpinStatus = {
    enabled: false,
    popupEnabled: false,
    winnersEnabled: false,
    tickets: [],
    wheels: {},
    nextExpiresAt: null,
    activeVouchers: 0,
    activeCoupons: 0,
    spinsLeftToday: null,
  }

  if (!(await isSpinEnabled(nativeDB))) return empty

  // The free daily / weekend tickets are created lazily, right here, the
  // first time the user loads the dashboard that day.
  await ensureLazyTickets(userId, nativeDB).catch((err) => console.error("[spinEngine] lazy tickets failed:", err))
  // Heal any prize that was drawn but not yet delivered (e.g. a timeout mid-spin).
  await retryUnfulfilledSpins(userId, nativeDB).catch((err) => console.error("[spinEngine] retry fulfil failed:", err))

  const [settings, tickets] = await Promise.all([getSpinSettings(nativeDB), listAvailableTickets(userId, nativeDB)])

  const wheels: Record<string, WheelSegment[]> = {}
  for (const key of new Set(tickets.map((t) => t.sourceKey))) {
    wheels[key] = (await listPrizes(key, { activeOnly: true }, nativeDB)).map(toSegment)
  }

  const now = sqlTime()
  const counts = await d1Query(
    `SELECT kind, COUNT(*) AS n FROM spin_vouchers WHERE user_id = ? AND status = 'active' AND expires_at > ? GROUP BY kind`,
    [userId, now],
    nativeDB,
  )
  let activeVouchers = 0
  let activeCoupons = 0
  for (const r of counts.results ?? []) {
    if (r.kind === "discount") activeCoupons += r.n
    else activeVouchers += r.n
  }

  let spinsLeftToday: number | null = null
  if (settings.globalDailyCapPerUser > 0) {
    const used = await d1Query("SELECT COUNT(*) AS n FROM spin_spins WHERE user_id = ? AND day_key = ?", [userId, dayKeyOf()], nativeDB)
    spinsLeftToday = Math.max(0, settings.globalDailyCapPerUser - (used.results?.[0]?.n ?? 0))
  }

  return {
    enabled: true,
    popupEnabled: settings.popupEnabled,
    winnersEnabled: settings.winnerFeedEnabled,
    tickets,
    wheels,
    nextExpiresAt: tickets[0]?.expiresAt ?? null,
    activeVouchers,
    activeCoupons,
    spinsLeftToday,
  }
}

// ── The spin ──────────────────────────────────────────────────────────

function drawWeight(p: SpinPrize, boostPercent: number): number {
  const w = Math.min(Math.max(0, Math.floor(p.weight)), MAX_WEIGHT)
  // Boost only ever helps REAL prizes; the "nothing" slice keeps its weight.
  return p.prizeType === "nothing" ? w * 100 : Math.round(w * (100 + Math.max(0, boostPercent)))
}

function weightedPick<T>(items: { item: T; w: number }[]): T | null {
  const total = items.reduce((s, i) => s + i.w, 0)
  if (total <= 0) return null
  let r = randomInt(total)
  for (const i of items) {
    if (r < i.w) return i.item
    r -= i.w
  }
  return items[items.length - 1].item
}

function prizeSnapshot(p: SpinPrize): string {
  return JSON.stringify({
    label: p.label,
    amountKobo: p.amountKobo,
    discountPercent: p.discountPercent,
    maxDiscountKobo: p.maxDiscountKobo,
    discountServices: p.discountServices,
    discountMinPurchaseKobo: p.discountMinPurchaseKobo,
    voucherNetwork: p.voucherNetwork,
    voucherPlanCode: p.voucherPlanCode,
    tokenCount: p.tokenCount,
    rewardValidDays: p.rewardValidDays,
  })
}

function outcomeMessage(type: SpinPrizeType, label: string, snap: any): string {
  const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG")}`
  switch (type) {
    case "wallet_credit":
      return `${naira(snap.amountKobo ?? 0)} has been added to your wallet. You can spend it on any purchase.`
    case "discount":
      return `${snap.discountPercent}% off your next purchase${snap.maxDiscountKobo > 0 ? ` (up to ${naira(snap.maxDiscountKobo)})` : ""}. It applies automatically at checkout.`
    case "airtime_voucher":
    case "data_voucher":
      return `${label} is waiting in your prizes. Claim it and we'll send it to any number you choose.`
    case "streak_protection":
      return `${snap.tokenCount ?? 1} streak shield${(snap.tokenCount ?? 1) > 1 ? "s" : ""} added. A missed check-in day won't break your streak.`
    default:
      return "Better luck next time!"
  }
}

export async function performSpin(
  params: { userId: string; ticketId?: string; ipHash?: string; deviceHash?: string },
  nativeDB?: any,
): Promise<PerformSpinResult> {
  if (!(await isSpinEnabled(nativeDB))) return { ok: false, message: "Spin & Win isn't available right now.", status: 400 }

  const settings = await getSpinSettings(nativeDB)
  const now = new Date()
  const today = dayKeyOf(now)

  // 1. Anti-abuse.
  if (settings.globalDailyCapPerUser > 0) {
    const r = await d1Query("SELECT COUNT(*) AS n FROM spin_spins WHERE user_id = ? AND day_key = ?", [params.userId, today], nativeDB)
    if ((r.results?.[0]?.n ?? 0) >= settings.globalDailyCapPerUser) {
      return { ok: false, message: "You've reached today's spin limit. Come back tomorrow!", status: 429 }
    }
  }
  if (params.deviceHash && settings.maxAccountsPerDevicePerDay > 0) {
    const r = await d1Query(
      "SELECT COUNT(DISTINCT user_id) AS n FROM spin_spins WHERE device_hash = ? AND day_key = ? AND user_id != ?",
      [params.deviceHash, today, params.userId],
      nativeDB,
    )
    if ((r.results?.[0]?.n ?? 0) >= settings.maxAccountsPerDevicePerDay) {
      return { ok: false, message: "Spin isn't available from this device right now.", status: 429 }
    }
  }
  if (params.ipHash && settings.maxSpinsPerIpPerDay > 0) {
    const r = await d1Query("SELECT COUNT(*) AS n FROM spin_spins WHERE ip_hash = ? AND day_key = ?", [params.ipHash, today], nativeDB)
    if ((r.results?.[0]?.n ?? 0) >= settings.maxSpinsPerIpPerDay) {
      return { ok: false, message: "Too many spins from this network today. Please try again tomorrow.", status: 429 }
    }
  }

  // 2. Consume one ticket atomically (soonest-expiring first unless a specific one was asked for).
  const nowSql = sqlTime(now)
  const consume = await d1Query(
    `UPDATE spin_tickets SET status = 'used', used_at = ?
      WHERE id = (
        SELECT t.id FROM spin_tickets t
          JOIN spin_sources s ON s.source_key = t.source_key
         WHERE t.user_id = ? AND t.status = 'available' AND t.expires_at > ? AND s.is_enabled = 1
           ${params.ticketId ? "AND t.id = ?" : ""}
         ORDER BY t.expires_at ASC, t.created_at ASC LIMIT 1
      ) AND status = 'available'
      RETURNING id, source_key`,
    params.ticketId ? [nowSql, params.userId, nowSql, params.ticketId] : [nowSql, params.userId, nowSql],
    nativeDB,
  )
  const ticket = consume.results?.[0]
  if (!ticket) return { ok: false, message: "You don't have a spin available right now.", status: 400 }

  const spinId = randomUUID()

  try {
    const source = await getSource(ticket.source_key, nativeDB)
    if (!source) throw new Error(`Unknown source ${ticket.source_key}`)

    const prizes = await listPrizes(source.sourceKey, { activeOnly: true }, nativeDB)
    const bonus = await getTierBonus(params.userId, source.sourceKey, nativeDB)

    const lossRow = await d1Query(
      "SELECT consecutive_losses FROM spin_loss_streaks WHERE user_id = ? AND source_key = ?",
      [params.userId, source.sourceKey],
      nativeDB,
    )
    const losses: number = lossRow.results?.[0]?.consecutive_losses ?? 0
    const guaranteeDue = source.guaranteeAfterLosses > 0 && losses >= source.guaranteeAfterLosses

    const weekStart = sqlTime(addDays(now, -7))

    // Pre-read caps and budget so the draw can skip prizes that are exhausted.
    // (The INSERT below re-checks them atomically — this only shapes the draw.)
    const winsByPrize = new Map<string, { day: number; week: number }>()
    const capped = prizes.filter((p) => p.maxWinsPerDay > 0 || p.maxWinsPerWeek > 0)
    if (capped.length > 0) {
      const marks = capped.map(() => "?").join(",")
      const rows = await d1Query(
        `SELECT prize_id, SUM(CASE WHEN day_key = ? THEN 1 ELSE 0 END) AS d, COUNT(*) AS w
           FROM spin_spins WHERE prize_id IN (${marks}) AND created_at >= ? GROUP BY prize_id`,
        [today, ...capped.map((p) => p.id), weekStart],
        nativeDB,
      )
      for (const r of rows.results ?? []) winsByPrize.set(r.prize_id, { day: r.d ?? 0, week: r.w ?? 0 })
    }
    const spentSource = (
      await d1Query("SELECT COALESCE(SUM(cost_kobo), 0) AS n FROM spin_spins WHERE source_key = ? AND day_key = ?", [source.sourceKey, today], nativeDB)
    ).results?.[0]?.n ?? 0
    const spentGlobal = (
      await d1Query("SELECT COALESCE(SUM(cost_kobo), 0) AS n FROM spin_spins WHERE day_key = ?", [today], nativeDB)
    ).results?.[0]?.n ?? 0

    const excluded = new Set<string>()
    let chosen: SpinPrize | null = null
    let wasGuarantee = false
    let inserted = false

    for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
      const eligible = prizes.filter((p) => {
        if (excluded.has(p.id) || p.weight <= 0) return false
        const wins = winsByPrize.get(p.id)
        if (p.maxWinsPerDay > 0 && (wins?.day ?? 0) >= p.maxWinsPerDay) return false
        if (p.maxWinsPerWeek > 0 && (wins?.week ?? 0) >= p.maxWinsPerWeek) return false
        if (p.costKobo > 0) {
          if (source.dailyBudgetKobo > 0 && spentSource + p.costKobo > source.dailyBudgetKobo) return false
          if (settings.globalDailyBudgetKobo > 0 && spentGlobal + p.costKobo > settings.globalDailyBudgetKobo) return false
        }
        return true
      })

      let pool = eligible
      let forced = false
      if (guaranteeDue) {
        const real = eligible.filter((p) => p.prizeType !== "nothing")
        let g = real.filter((p) => p.isGuaranteePrize)
        if (g.length === 0 && real.length > 0) {
          // No prize flagged as the guarantee: fall back to the cheapest real prize(s).
          const cheapest = Math.min(...real.map((p) => (p.costKobo > 0 ? p.costKobo : Number.MAX_SAFE_INTEGER)))
          g = real.filter((p) => (p.costKobo > 0 ? p.costKobo : Number.MAX_SAFE_INTEGER) === cheapest)
        }
        if (g.length > 0) {
          pool = g
          forced = true
        }
      }

      const pick = weightedPick(pool.map((p) => ({ item: p, w: drawWeight(p, bonus.weightBoostPercent) })))
      if (!pick) break

      const cost = pick.costKobo
      const srcBudget = cost > 0 ? source.dailyBudgetKobo : 0
      const globalBudget = cost > 0 ? settings.globalDailyBudgetKobo : 0

      const res = await d1Query(
        `INSERT INTO spin_spins
           (id, user_id, ticket_id, source_key, prize_id, prize_label, prize_type, prize_amount_kobo, cost_kobo,
            was_guarantee, fulfilled, prize_snapshot, ip_hash, device_hash, day_key)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (? = 0 OR (SELECT COUNT(*) FROM spin_spins WHERE prize_id = ? AND day_key = ?) < ?)
            AND (? = 0 OR (SELECT COUNT(*) FROM spin_spins WHERE prize_id = ? AND created_at >= ?) < ?)
            AND (? = 0 OR (SELECT COALESCE(SUM(cost_kobo), 0) FROM spin_spins WHERE source_key = ? AND day_key = ?) + ? <= ?)
            AND (? = 0 OR (SELECT COALESCE(SUM(cost_kobo), 0) FROM spin_spins WHERE day_key = ?) + ? <= ?)
         RETURNING id`,
        [
          spinId,
          params.userId,
          ticket.id,
          source.sourceKey,
          pick.id,
          pick.label,
          pick.prizeType,
          pick.prizeType === "wallet_credit" || pick.prizeType === "airtime_voucher" ? pick.amountKobo : 0,
          cost,
          forced ? 1 : 0,
          pick.prizeType === "nothing" ? 1 : 0,
          prizeSnapshot(pick),
          params.ipHash ?? null,
          params.deviceHash ?? null,
          today,
          pick.maxWinsPerDay, pick.id, today, pick.maxWinsPerDay,
          pick.maxWinsPerWeek, pick.id, weekStart, pick.maxWinsPerWeek,
          srcBudget, source.sourceKey, today, cost, srcBudget,
          globalBudget, today, cost, globalBudget,
        ],
        nativeDB,
      )

      if ((res.results?.length ?? 0) > 0) {
        inserted = true
        chosen = pick
        wasGuarantee = forced
      } else {
        // A racing spin used up this prize's cap or the budget first — draw again without it.
        excluded.add(pick.id)
      }
    }

    if (!inserted) {
      // Nothing eligible (empty table, everything capped, budget spent): the user
      // still gets a clean "better luck" result instead of an error.
      const nothing = prizes.find((p) => p.prizeType === "nothing") ?? null
      await d1Query(
        `INSERT INTO spin_spins
           (id, user_id, ticket_id, source_key, prize_id, prize_label, prize_type, prize_amount_kobo, cost_kobo,
            was_guarantee, fulfilled, prize_snapshot, ip_hash, device_hash, day_key)
         VALUES (?, ?, ?, ?, ?, ?, 'nothing', 0, 0, 0, 1, '{}', ?, ?, ?)`,
        [spinId, params.userId, ticket.id, source.sourceKey, nothing?.id ?? null, nothing?.label ?? "Better luck next time", params.ipHash ?? null, params.deviceHash ?? null, today],
        nativeDB,
      )
      chosen = nothing
    }

    const type: SpinPrizeType = chosen?.prizeType ?? "nothing"
    const isWin = type !== "nothing"

    await d1Query(
      `INSERT INTO spin_loss_streaks (user_id, source_key, consecutive_losses) VALUES (?, ?, ?)
       ON CONFLICT(user_id, source_key) DO UPDATE SET consecutive_losses = ?, updated_at = datetime('now')`,
      [params.userId, source.sourceKey, isWin ? 0 : 1, isWin ? 0 : losses + 1],
      nativeDB,
    ).catch((err) => console.error("[spinEngine] loss streak update failed:", err))

    // 5. Deliver the prize. If this throws, getSpinStatus / the cron retry it (idempotent).
    const spinRow = await d1Query("SELECT * FROM spin_spins WHERE id = ?", [spinId], nativeDB)
    if (spinRow.results?.[0]) {
      await fulfilSpin(spinRow.results[0], nativeDB).catch((err) =>
        console.error("[spinEngine] fulfilment failed (will retry):", spinId, err),
      )
    }

    const left = await d1Query(
      `SELECT COUNT(*) AS n FROM spin_tickets t JOIN spin_sources s ON s.source_key = t.source_key
        WHERE t.user_id = ? AND t.status = 'available' AND t.expires_at > ? AND s.is_enabled = 1`,
      [params.userId, sqlTime()],
      nativeDB,
    )

    const snap = chosen ? safeJson(prizeSnapshot(chosen), {}) : {}
    return {
      ok: true,
      outcome: {
        spinId,
        prizeId: chosen?.id ?? null,
        prizeLabel: chosen?.label ?? "Better luck next time",
        prizeType: type,
        amountKobo: chosen?.amountKobo ?? 0,
        wasGuarantee,
        ticketsLeft: left.results?.[0]?.n ?? 0,
        message: outcomeMessage(type, chosen?.label ?? "", snap),
      },
    }
  } catch (err) {
    // Something broke AFTER the ticket was consumed and BEFORE a result was saved:
    // hand the ticket back so the user doesn't lose it.
    console.error("[spinEngine] spin failed, restoring ticket:", err)
    await d1Query(
      `UPDATE spin_tickets SET status = 'available', used_at = NULL
        WHERE id = ? AND NOT EXISTS (SELECT 1 FROM spin_spins WHERE ticket_id = ?)`,
      [ticket.id, ticket.id],
      nativeDB,
    ).catch(() => undefined)
    return { ok: false, message: "Something went wrong. Your spin has been kept — please try again.", status: 500 }
  }
}

// ── Fulfilment ────────────────────────────────────────────────────────

/** Delivers one drawn prize. Safe to call repeatedly: every path is idempotent. */
export async function fulfilSpin(spin: any, nativeDB?: any): Promise<void> {
  if (spin.fulfilled === 1) return
  const snap = safeJson<any>(spin.prize_snapshot, {})
  const userId: string = spin.user_id

  switch (spin.prize_type as SpinPrizeType) {
    case "nothing":
      break

    case "wallet_credit": {
      const amount = Number(spin.prize_amount_kobo) || 0
      if (amount > 0) {
        await creditWallet(
          {
            userId,
            amountKobo: amount,
            type: "spin_reward",
            reference: `ZPSPIN-${spin.id}`,
            metadata: { reason: "spin_reward", spinId: spin.id, source: spin.source_key, prize: spin.prize_label },
          },
          nativeDB,
        )
      }
      break
    }

    case "discount":
    case "airtime_voucher":
    case "data_voucher": {
      const kind = spin.prize_type === "discount" ? "discount" : spin.prize_type === "airtime_voucher" ? "airtime" : "data"
      const expires = sqlTime(addDays(fromSqlTime(spin.created_at), Math.max(1, Number(snap.rewardValidDays) || 7)))
      await d1Query(
        `INSERT OR IGNORE INTO spin_vouchers
           (id, user_id, spin_id, kind, label, value_kobo, network, plan_code, discount_percent, max_discount_kobo,
            discount_services, min_purchase_kobo, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          `v-${spin.id}`,
          userId,
          spin.id,
          kind,
          snap.label ?? spin.prize_label,
          kind === "airtime" ? Number(snap.amountKobo) || 0 : 0,
          snap.voucherNetwork ?? null,
          snap.voucherPlanCode ?? null,
          Number(snap.discountPercent) || 0,
          Number(snap.maxDiscountKobo) || 0,
          snap.discountServices ?? null,
          Number(snap.discountMinPurchaseKobo) || 0,
          expires,
        ],
        nativeDB,
      )
      break
    }

    case "streak_protection": {
      // Claim first, then grant: shields are a counter, not an idempotent row, so the
      // fulfilled flag is what stops a retry from granting them twice.
      const claim = await d1Query("UPDATE spin_spins SET fulfilled = 1 WHERE id = ? AND fulfilled = 0 RETURNING id", [spin.id], nativeDB)
      if ((claim.results?.length ?? 0) > 0) {
        await addProtectionTokens(userId, Math.max(1, Number(snap.tokenCount) || 1), nativeDB)
      }
      return
    }
  }

  await d1Query("UPDATE spin_spins SET fulfilled = 1 WHERE id = ?", [spin.id], nativeDB)
}

/** Re-delivers this user's prizes that were drawn but never marked delivered (older than 30s so we don't race a live spin). */
export async function retryUnfulfilledSpins(userId: string, nativeDB?: any): Promise<void> {
  const result = await d1Query(
    "SELECT * FROM spin_spins WHERE user_id = ? AND fulfilled = 0 AND created_at <= ? ORDER BY created_at ASC LIMIT 10",
    [userId, sqlTime(new Date(Date.now() - 30_000))],
    nativeDB,
  )
  for (const row of result.results ?? []) {
    await fulfilSpin(row, nativeDB).catch((err) => console.error("[spinEngine] retry fulfil failed:", row.id, err))
  }
}

// ── History and winners ───────────────────────────────────────────────

export interface SpinHistoryItem {
  id: string
  sourceKey: string
  sourceLabel: string | null
  prizeLabel: string
  prizeType: SpinPrizeType
  amountKobo: number
  wasGuarantee: boolean
  createdAt: string
}

export async function getSpinHistory(userId: string, limit = 50, nativeDB?: any): Promise<SpinHistoryItem[]> {
  const result = await d1Query(
    `SELECT s.id, s.source_key, src.label AS source_label, s.prize_label, s.prize_type, s.prize_amount_kobo, s.was_guarantee, s.created_at
       FROM spin_spins s LEFT JOIN spin_sources src ON src.source_key = s.source_key
      WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ?`,
    [userId, Math.min(Math.max(1, limit), 200)],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    id: r.id,
    sourceKey: r.source_key,
    sourceLabel: r.source_label ?? null,
    prizeLabel: r.prize_label,
    prizeType: r.prize_type,
    amountKobo: r.prize_amount_kobo ?? 0,
    wasGuarantee: r.was_guarantee === 1,
    createdAt: r.created_at,
  }))
}

function maskName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? ""
  if (!first) return "A user"
  return `${first.slice(0, first.length <= 2 ? 1 : 2)}***`
}

export interface WinnerItem {
  name: string
  prizeLabel: string
  amountKobo: number
  prizeType: SpinPrizeType
  createdAt: string
}

/** Recent real wins for the "A user just won ₦500" ticker. Names are masked; only prizes at/above the admin minimum. */
export async function getRecentWinners(nativeDB?: any): Promise<WinnerItem[]> {
  if (!(await isSpinEnabled(nativeDB))) return []
  const settings = await getSpinSettings(nativeDB)
  if (!settings.winnerFeedEnabled) return []

  const result = await d1Query(
    `SELECT s.prize_label, s.prize_type, s.prize_amount_kobo, s.created_at, u.full_name
       FROM spin_spins s JOIN users u ON u.id = s.user_id
      WHERE s.prize_type != 'nothing' AND s.prize_amount_kobo >= ?
      ORDER BY s.created_at DESC LIMIT ?`,
    [settings.winnerFeedMinKobo, settings.winnerFeedLimit],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    name: maskName(r.full_name),
    prizeLabel: r.prize_label,
    amountKobo: r.prize_amount_kobo ?? 0,
    prizeType: r.prize_type,
    createdAt: r.created_at,
  }))
}

// Re-exported so routes only need one import for prize reads.
export { mapPrize }
export type { SpinSource }
