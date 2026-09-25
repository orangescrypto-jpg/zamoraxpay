// src/services/spinVouchers.ts
// Service abstraction layer — non-wallet spin prizes.
//
//   airtime voucher — "Free ₦200 airtime". The user claims it and gives a phone
//                     number; WE buy it from the VTU provider at our cost. It is
//                     never wallet money, so it can't be withdrawn or spent on
//                     anything else.
//   data voucher    — a specific network + plan the admin chose, an "any
//                     network" plan (same size + validity everywhere), OR a
//                     per-network map (a DIFFERENT plan chosen for each
//                     network): the network is resolved from the winner's
//                     own phone number at claim time — see ANY_NETWORK_PREFIX
//                     / MAP_PREFIX and their resolvers below.
//   discount coupon — "5% off your next purchase". Applied AUTOMATICALLY by
//                     purchaseFlow.ts to the user's next eligible purchase.
//
// SAFETY
//  - A voucher is claimed with one guarded UPDATE ... RETURNING, so it can only
//    be used once even with double taps.
//  - If delivery fails (provider down, order failed, reconcile later marks the
//    order failed), vtuOrders.ts puts the voucher back to 'active' — the user
//    never loses a prize to a failed delivery.
//  - Voucher-funded orders are recorded with amount_kobo = 0 (nothing was
//    charged) and base_amount_kobo = our real cost, so the margin report shows
//    the promotion cost honestly.

import { d1Query } from "@/lib/d1"
import { isFeatureEnabled } from "@/src/services/config"
import { createPendingOrder, finalizeOrder } from "@/src/services/vtuOrders"
import { executeVtuPurchase } from "@/src/services/vtuRouter"
import { hasLiveRoute } from "@/src/services/providerPlanMappings"
import { lookupPrice } from "@/src/services/pricing"
import { detectNetwork, isValidNgPhone, matchesSelectedNetwork, normalizeNgPhone } from "@/lib/networkDetect"
import { DEFAULT_DISCOUNT_SERVICES, NETWORKS, sqlTime } from "@/src/services/spinConfig"

// Marks a data-voucher prize's stored plan_code as "any network" rather than
// one exact provider plan_code. Format: "any:<size>mb-<days>d[-category]",
// e.g. "any:1000mb-30d" or "any:1000mb-30d-gifting" — the same base shape
// canonicalPlanKey() produces (see planNormalization.ts), just prefixed so it
// can never collide with (and is never mistaken for) a real plan_code.
export const ANY_NETWORK_PREFIX = "any:"

// Marks a data-voucher prize's stored plan_code as an explicit per-network
// map, so the admin can give each network a DIFFERENT plan under one prize
// (not just the same size/validity everywhere). Format:
// "map:{"MTN":"1000mb-30d","Glo":"1500mb-30d-gifting"}" — a JSON object of
// network -> that network's own real plan_code. A network can be left out
// entirely (no key), meaning that network has no plan configured for this
// prize and will show as "not available" if won on that network.
export const MAP_PREFIX = "map:"

/** Builds a "map:{...}" target from a { network: planCode } selection. Drops blank entries. */
export function mapNetworkTarget(byNetwork: Record<string, string | null | undefined>): string | null {
  const cleaned: Record<string, string> = {}
  for (const [network, planCode] of Object.entries(byNetwork)) {
    if (planCode && planCode.trim()) cleaned[network] = planCode.trim()
  }
  if (Object.keys(cleaned).length === 0) return null
  return `${MAP_PREFIX}${JSON.stringify(cleaned)}`
}

/** Parses a "map:{...}" target back to { network: planCode }. Returns {} if malformed or not a map target. */
export function parseNetworkMap(target: string): Record<string, string> {
  if (!target.startsWith(MAP_PREFIX)) return {}
  try {
    const parsed = JSON.parse(target.slice(MAP_PREFIX.length))
    if (!parsed || typeof parsed !== "object") return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" && v) out[k] = v
    return out
  } catch {
    return {}
  }
}

/** Builds the "any:<size>mb-<days>d[-category]" target from one representative plan_code. */
export function anyNetworkTargetFromPlanCode(planCode: string): string | null {
  const match = planCode.match(/^(\d+mb-\d+d)((?:-[a-z_+]+)*)$/i)
  if (!match) return null
  const [, base, suffixPart] = match
  const CATEGORY_KEYS = new Set(["gifting", "awoof", "cg", "cg_lite", "sme", "corporate", "direct", "standard"])
  const segments = suffixPart ? suffixPart.split("-").filter(Boolean) : []
  const category = segments.find((s) => CATEGORY_KEYS.has(s))
  return `${ANY_NETWORK_PREFIX}${base}${category ? "-" + category : ""}`
}

/**
 * Resolves an "any:<size>mb-<days>d[-category]" target to a real plan_code on
 * one specific network, by matching size + validity (+ category, if the
 * target has one) against that network's own active data plans. Different
 * networks' plan_codes for "the same" size/validity are separate rows with
 * separate prices — that's expected, not a bug (see spinAdmin.ts). Returns
 * null when this network currently has no plan matching that shape at all.
 */
async function resolveAnyNetworkPlanCode(network: string, target: string, nativeDB?: any): Promise<string | null> {
  const body = target.slice(ANY_NETWORK_PREFIX.length) // "<size>mb-<days>d[-category]"
  const match = body.match(/^(\d+mb-\d+d)(?:-([a-z_]+))?$/i)
  if (!match) return null
  const [, base, category] = match

  const rows = await d1Query(
    "SELECT plan_code FROM pricing_rules WHERE service_type = 'data' AND network_or_biller = ? AND is_active = 1 AND plan_code IS NOT NULL",
    [network],
    nativeDB,
  )
  const candidates = (rows.results ?? []).map((r: any) => String(r.plan_code)) as string[]

  // Prefer an exact base match with no extra suffix at all (the plain, most
  // "generic" version of that size/validity on this network).
  const baseRe = new RegExp(`^${base}$`, "i")
  const exact = candidates.find((c) => baseRe.test(c))
  if (exact) return exact

  // Otherwise, match the requested category if the admin asked for one;
  // reject anything with a DIFFERENT category attached so we never silently
  // substitute a gifting plan for an sme one, etc.
  const withSuffixRe = new RegExp(`^${base}((?:-[a-z_+]+)*)$`, "i")
  for (const c of candidates) {
    const m = c.match(withSuffixRe)
    if (!m) continue
    const segs = (m[1] ? m[1].split("-").filter(Boolean) : []).map((s) => s.toLowerCase())
    const CATEGORY_KEYS = new Set(["gifting", "awoof", "cg", "cg_lite", "sme", "corporate", "direct", "standard"])
    const planCategory = segs.find((s) => CATEGORY_KEYS.has(s))
    if (category) {
      if (planCategory === category.toLowerCase()) return c
    } else if (!planCategory) {
      return c
    }
  }
  return null
}


export interface UserVoucher {
  id: string
  kind: "airtime" | "data" | "discount"
  label: string
  valueKobo: number
  network: string | null
  planCode: string | null
  discountPercent: number
  maxDiscountKobo: number
  discountServices: string[]
  minPurchaseKobo: number
  status: "active" | "used" | "expired"
  expiresAt: string
  usedAt: string | null
  recipient: string | null
  createdAt: string
}

function mapVoucher(r: any): UserVoucher {
  const now = sqlTime()
  const expired = r.status === "active" && r.expires_at <= now
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    valueKobo: r.value_kobo ?? 0,
    network: r.network ?? null,
    planCode: r.plan_code ?? null,
    discountPercent: r.discount_percent ?? 0,
    maxDiscountKobo: r.max_discount_kobo ?? 0,
    discountServices: r.discount_services ? String(r.discount_services).split(",").map((s: string) => s.trim()).filter(Boolean) : DEFAULT_DISCOUNT_SERVICES,
    minPurchaseKobo: r.min_purchase_kobo ?? 0,
    status: expired ? "expired" : r.status,
    expiresAt: r.expires_at,
    usedAt: r.used_at ?? null,
    recipient: r.recipient ?? null,
    createdAt: r.created_at,
  }
}

export async function listUserVouchers(userId: string, nativeDB?: any): Promise<UserVoucher[]> {
  const result = await d1Query(
    "SELECT * FROM spin_vouchers WHERE user_id = ? ORDER BY (status = 'active') DESC, created_at DESC LIMIT 60",
    [userId],
    nativeDB,
  )
  return (result.results ?? []).map(mapVoucher)
}

// ── Discount coupons (applied inside purchaseFlow) ────────────────────

export interface ClaimedCoupon {
  id: string
  discountKobo: number
}

/**
 * Finds the user's best eligible discount coupon for this purchase and claims
 * it. Returns null when there is none (or someone else got there first).
 * The claim is one guarded UPDATE, so a coupon can only ever be used once.
 */
export async function claimBestCoupon(
  params: { userId: string; serviceType: string; chargeAmountKobo: number },
  nativeDB?: any,
): Promise<ClaimedCoupon | null> {
  const now = sqlTime()
  const result = await d1Query(
    "SELECT * FROM spin_vouchers WHERE user_id = ? AND kind = 'discount' AND status = 'active' AND expires_at > ? ORDER BY expires_at ASC LIMIT 20",
    [params.userId, now],
    nativeDB,
  )

  let best: { id: string; discountKobo: number } | null = null
  for (const r of result.results ?? []) {
    const services = r.discount_services ? String(r.discount_services).split(",").map((s: string) => s.trim()).filter(Boolean) : DEFAULT_DISCOUNT_SERVICES
    if (!services.includes(params.serviceType)) continue
    if ((r.min_purchase_kobo ?? 0) > params.chargeAmountKobo) continue

    let discount = Math.floor((params.chargeAmountKobo * (r.discount_percent ?? 0)) / 100)
    if ((r.max_discount_kobo ?? 0) > 0) discount = Math.min(discount, r.max_discount_kobo)
    // Never discount the whole purchase to nothing.
    discount = Math.min(discount, Math.max(0, params.chargeAmountKobo - 100))
    if (discount <= 0) continue
    if (!best || discount > best.discountKobo) best = { id: r.id, discountKobo: discount }
  }
  if (!best) return null

  const claim = await d1Query(
    "UPDATE spin_vouchers SET status = 'used', used_at = ? WHERE id = ? AND user_id = ? AND status = 'active' AND expires_at > ? RETURNING id",
    [now, best.id, params.userId, now],
    nativeDB,
  )
  return (claim.results?.length ?? 0) > 0 ? best : null
}

export async function linkCouponToOrder(couponId: string, orderId: string, nativeDB?: any): Promise<void> {
  await d1Query("UPDATE spin_vouchers SET used_order_id = ? WHERE id = ?", [orderId, couponId], nativeDB)
}

/** Puts a claimed coupon back (used when the order could not even be created). */
export async function releaseCoupon(couponId: string, nativeDB?: any): Promise<void> {
  await d1Query(
    "UPDATE spin_vouchers SET status = 'active', used_at = NULL, used_order_id = NULL WHERE id = ? AND status = 'used'",
    [couponId],
    nativeDB,
  )
}

// ── Airtime / data voucher claim ──────────────────────────────────────

export interface ClaimVoucherResult {
  success: boolean
  message: string
  orderId?: string
  isPending?: boolean
}

export async function claimVoucher(
  params: { userId: string; voucherId: string; recipient: string; network?: string },
  nativeDB?: any,
): Promise<ClaimVoucherResult> {
  const vRes = await d1Query("SELECT * FROM spin_vouchers WHERE id = ? AND user_id = ?", [params.voucherId, params.userId], nativeDB)
  const v = vRes.results?.[0]
  if (!v || (v.kind !== "airtime" && v.kind !== "data")) return { success: false, message: "Prize not found." }
  if (v.status !== "active") return { success: false, message: "This prize has already been used." }
  if (v.expires_at <= sqlTime()) return { success: false, message: "This prize has expired." }

  const recipient = normalizeNgPhone(params.recipient ?? "")
  if (!isValidNgPhone(recipient)) return { success: false, message: "Enter a valid 11-digit Nigerian phone number." }

  const serviceType = v.kind === "airtime" ? "airtime" : "data"
  if (!(await isFeatureEnabled(`service_${serviceType}`, nativeDB))) {
    return { success: false, message: `${serviceType === "airtime" ? "Airtime" : "Data"} is unavailable right now. Your prize is safe — try again later.` }
  }

  // Network: a data voucher is locked to its plan's network. An airtime voucher is
  // locked only if the admin locked it; otherwise the user's choice (or the detected one).
  let network: string | null = v.network ?? null
  if (!network) network = params.network || detectNetwork(recipient)
  if (!network || !NETWORKS.includes(network)) return { success: false, message: "Choose the network for this number." }
  if (!matchesSelectedNetwork(recipient, network as any)) {
    return {
      success: false,
      message: `This number looks like it's on ${detectNetwork(recipient)}, not ${network}. Airtime and data can't be recovered once sent, so please check the number.`,
    }
  }

  let planCode: string | null = null
  let baseCostKobo = 0
  if (v.kind === "airtime") {
    baseCostKobo = v.value_kobo
    if (baseCostKobo <= 0) return { success: false, message: "This prize is not valid." }
  } else {
    planCode = v.plan_code
    if (!planCode) return { success: false, message: "This prize is not valid." }
    if (planCode.startsWith(MAP_PREFIX)) {
      const byNetwork = parseNetworkMap(planCode)
      const resolved = byNetwork[network]
      if (!resolved) {
        return { success: false, message: "This data plan isn't available on your network right now. Your prize is safe — try again later." }
      }
      planCode = resolved
    } else if (planCode.startsWith(ANY_NETWORK_PREFIX)) {
      const resolved = await resolveAnyNetworkPlanCode(network, planCode, nativeDB)
      if (!resolved) {
        return { success: false, message: "This data plan isn't available on your network right now. Your prize is safe — try again later." }
      }
      planCode = resolved
    }
    const price = await lookupPrice("data", network, planCode, "retail", undefined, nativeDB)
    if (!price.found) return { success: false, message: "This data plan isn't available right now. Your prize is safe — try again later." }
    baseCostKobo = price.baseAmountKobo
    if (!(await hasLiveRoute("data", network, planCode, nativeDB))) {
      return { success: false, message: "This data plan is temporarily unavailable. Your prize is safe — try again later." }
    }
  }

  // Claim (once).
  const now = sqlTime()
  const claim = await d1Query(
    "UPDATE spin_vouchers SET status = 'used', used_at = ?, recipient = ? WHERE id = ? AND user_id = ? AND status = 'active' AND expires_at > ? RETURNING id",
    [now, recipient, v.id, params.userId, now],
    nativeDB,
  )
  if ((claim.results?.length ?? 0) === 0) return { success: false, message: "This prize has already been used." }

  let orderId: string
  try {
    orderId = await createPendingOrder(
      {
        userId: params.userId,
        serviceType,
        networkOrBiller: network,
        recipient,
        planCode,
        amountKobo: 0, // nothing charged to the customer
        baseAmountKobo: baseCostKobo, // what it really costs us
        convenienceFeeKobo: 0,
        pricingTier: "retail",
      },
      nativeDB,
    )
    await d1Query("UPDATE spin_vouchers SET used_order_id = ? WHERE id = ?", [orderId, v.id], nativeDB)
  } catch (err) {
    console.error("[spinVouchers] could not create voucher order:", err)
    await releaseCoupon(v.id, nativeDB).catch(() => undefined)
    return { success: false, message: "Something went wrong. Your prize is safe — please try again." }
  }

  const userRow = await d1Query("SELECT phone FROM users WHERE id = ?", [params.userId], nativeDB)
  const routerResult = await executeVtuPurchase(
    {
      serviceType,
      networkOrBiller: network,
      recipient,
      planCode: planCode ?? undefined,
      amountKobo: baseCostKobo,
      internalReference: `ZPVCH-${v.id}`,
      contactPhone: userRow.results?.[0]?.phone ?? undefined,
    },
    nativeDB,
  )

  const isPending = routerResult.success && routerResult.isPending
  // A failed order puts the voucher back automatically (see vtuOrders.finalizeOrder).
  await finalizeOrder(
    orderId,
    {
      status: !routerResult.success ? "failed" : isPending ? "pending" : "success",
      providerUsed: routerResult.providerUsed,
      providerReference: routerResult.providerReference,
      deliveredData: routerResult.deliveredData,
      attempts: routerResult.attempts,
      failureReason: routerResult.success ? undefined : routerResult.message,
      actualProviderCostKobo: routerResult.providerCostKobo,
    },
    nativeDB,
  )

  if (!routerResult.success) {
    return { success: false, orderId, message: `We couldn't deliver it right now (${routerResult.message}). Your prize has been put back — try again shortly.` }
  }
  return {
    success: true,
    orderId,
    isPending,
    message: isPending
      ? `Your free ${v.label} is on its way to ${recipient}. We'll confirm shortly.`
      : `Done! Your free ${v.label} has been sent to ${recipient}.`,
  }
}
