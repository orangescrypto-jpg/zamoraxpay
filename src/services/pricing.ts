// src/services/pricing.ts
// Service abstraction layer — pricing.
//
// Every price a user sees or is charged comes from here, reading
// admin-editable pricing_rules in D1 — never hardcoded in a checkout
// route. Admin can adjust retail/wholesale prices or fees per
// network/biller at any time without a redeploy.

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"
import { getActiveVtuProviders } from "@/src/services/config"
import { canonicalPlanKey, normalizeNetworkOrBiller, isCleanPlanCode } from "@/src/services/planNormalization"
import { getPricingPolicy, applyFee } from "@/src/services/pricingPolicies"

// Services where the customer names their own amount instead of
// picking a fixed plan — no pricing_rules row will ever exist for
// these (plan_code is null), so their fee comes straight from the
// pricing_policies convenience fee instead.
const FLEXIBLE_AMOUNT_SERVICES = new Set<VtuServiceType>(["airtime", "electricity", "betting"])

// pricing_rules.plan_code is nullable (flat services like airtime have
// none) — only normalize when a plan_code is actually present, so
// null stays null rather than becoming a stringified fallback.
function normalizedPlanCodeOrNull(
  planCode: string | null,
  networkOrBiller: string,
  serviceType: VtuServiceType,
): string | null {
  if (planCode === null) return null
  return canonicalPlanKey(planCode, networkOrBiller, serviceType).planCode
}

export interface PricingLookupResult {
  found: boolean
  baseAmountKobo: number // what we pay the VTU provider
  chargeAmountKobo: number // what we charge the user (base + fee, at their tier's price)
  convenienceFeeKobo: number
  tierUsed: "retail" | "wholesale"
}

export async function lookupPrice(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string | null,
  userTier: "retail" | "reseller",
  requestedAmountKobo?: number, // used for flexible-amount services like airtime/electricity
  nativeDB?: any,
): Promise<PricingLookupResult> {
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const normalizedPlanCode = normalizedPlanCodeOrNull(planCode, normalizedNetwork, serviceType)
  const result = await d1Query(
    `SELECT * FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1
       AND (plan_code = ? OR (plan_code IS NULL AND ? IS NULL))
     LIMIT 1`,
    [serviceType, normalizedNetwork, normalizedPlanCode, normalizedPlanCode],
    nativeDB,
  )

  const rule = result.results?.[0]

  // Flexible-amount services (airtime, electricity, betting) don't have
  // a fixed plan price — the user names the amount, and we apply the
  // convenience fee from pricing_policies on top of it. This never
  // goes through pricing_rules: reconcile is sourced from
  // provider_plan_mappings and keyed by plan_code, and these services
  // pass plan_code = null, so no pricing_rules row is ever created for
  // them — falling through to "convenienceFeeKobo: 0" unconditionally
  // (the old behavior) silently dropped the fee for every purchase.
  if (!rule) {
    if (requestedAmountKobo) {
      const tierUsed = userTier === "reseller" ? "wholesale" : "retail"
      let convenienceFeeKobo = 0
      if (FLEXIBLE_AMOUNT_SERVICES.has(serviceType)) {
        const policy = await getPricingPolicy(serviceType, nativeDB)
        if (policy) {
          convenienceFeeKobo = applyFee(requestedAmountKobo, policy.convenienceFeeType, policy.convenienceFeeValue)
        }
      }
      return {
        found: true,
        baseAmountKobo: requestedAmountKobo,
        chargeAmountKobo: requestedAmountKobo + convenienceFeeKobo,
        convenienceFeeKobo,
        tierUsed,
      }
    }
    return { found: false, baseAmountKobo: 0, chargeAmountKobo: 0, convenienceFeeKobo: 0, tierUsed: "retail" }
  }

  const tierUsed = userTier === "reseller" ? "wholesale" : "retail"
  const priceKobo = tierUsed === "wholesale" ? rule.wholesale_price_kobo : rule.retail_price_kobo

  return {
    found: true,
    baseAmountKobo: rule.retail_price_kobo, // approx. provider cost basis for margin tracking
    chargeAmountKobo: priceKobo + rule.convenience_fee_kobo,
    convenienceFeeKobo: rule.convenience_fee_kobo,
    tierUsed,
  }
}

export interface CustomerPlan {
  planCode: string
  priceKobo: number
}

// A group of sibling plans — same size + validity + network, different
// category (standard/awoof/gifting/cg/...) — shown to the customer as
// ONE line ("110MB - 1 day — from ₦107") with the category choice
// exposed as sub-options rather than hidden. Categories are kept as
// separate plan_codes deliberately (see planNormalization.ts): they can
// have different provider-side activation behavior, so auto-picking
// across them on fallback would risk silently delivering a different
// product than the one the customer saw. Grouping here is display-only
// — purchaseFlow still charges and routes by the exact planCode the
// customer picks, never substitutes a sibling behind their back.
export interface CustomerPlanGroup {
  groupKey: string // size+validity+network, e.g. "mtn-110mb-1d"
  label: string // e.g. "110MB - 1 day"
  cheapestPriceKobo: number
  variants: Array<{ planCode: string; category: string; priceKobo: number }>
}

// Splits a plan_code into (groupKey, category) so sibling categories of
// the same size+validity+network (or planFamily+validity+network, for
// named products like "collabo") collapse into one CustomerPlanGroup.
// Mirrors the two data plan_code shapes canonicalPlanKey() produces:
//   `<size>mb-<days>d[-<category>][-<bundletag>...]`
//   `<planfamily>-<days>d[-<category>][-<bundletag>...]`
// Only ever called for serviceType === "data" — cable's canonical code
// (`<cabletier>[-<days>d]`) has no category suffix at all (cable has no
// Awoof/Gifting-style variants), and exam_pin/epin's plan_code is a pin
// type or a denomination, not a size/category — grouping those would be
// meaningless, so listPlanGroups() only calls this for data.
// Bundle tags (social/binge/youtube/night) are a genuinely different
// restricted product, not a category, so they stay part of the group
// key and are never folded together with an unrestricted plan of the
// same size.
const CATEGORY_KEYS = new Set(["gifting", "awoof", "cg", "cg_lite", "sme", "corporate", "direct", "standard"])
function splitPlanCodeForGrouping(planCode: string, networkOrBiller: string): { groupKey: string; category: string } {
  // Two shapes: "<size>mb-<days>d..." (size-based) or
  // "<planfamily>-<days>d..." (named family, e.g. "collabo-30d...").
  // Try size-based first since it's the common case; fall back to the
  // family form, which just requires a trailing "-<digits>d" segment
  // with an arbitrary (non-numeric-prefixed) base before it.
  let base: string, suffixPart: string
  const sizeMatch = planCode.match(/^(\d+mb-\d+d)((?:-[a-z_+]+)*)$/i)
  if (sizeMatch) {
    ;[, base, suffixPart] = sizeMatch as unknown as [string, string, string]
  } else {
    const familyMatch = planCode.match(/^([a-z][a-z0-9]*-\d+d)((?:-[a-z_+]+)*)$/i)
    if (!familyMatch) return { groupKey: `${networkOrBiller}:${planCode}`, category: "standard" }
    ;[, base, suffixPart] = familyMatch as unknown as [string, string, string]
  }
  const segments = suffixPart ? suffixPart.split("-").filter(Boolean) : []
  const categorySegs = segments.filter((s) => CATEGORY_KEYS.has(s))
  const restSegs = segments.filter((s) => !CATEGORY_KEYS.has(s)) // bundle tags stay in the group key
  const category = categorySegs[0] ?? "standard"
  const groupKey = `${networkOrBiller}:${base}${restSegs.length ? "-" + restSegs.join("-") : ""}`
  return { groupKey, category }
}

// Customer-facing plan list for a given service/network, priced at the
// caller's tier. Unlike listPricingRules (admin-only, full rows), this
// only returns what a buy-data/buy-cable page needs, and never exposes
// wholesale price, provider cost basis, or admin metadata.
//
// A plan only shows here if BOTH are true:
//   1. pricing_rules.is_active = 1 (the admin's manual visibility toggle)
//   2. At least one provider_plan_mappings row for this exact plan is
//      is_active = 1 AND that provider is currently enabled in
//      vtu_provider_configs.
//
// Without (2), disabling a provider that was the ONLY one fulfilling a
// plan would leave that plan visible and purchasable on the buy page
// with zero working route underneath — the user pays, the router finds
// no enabled candidate, and the order fails after the wallet's already
// been debited. This makes visibility track provider status live,
// instead of relying on an admin remembering to flip pricing_rules
// off by hand every time they disable a provider.
export async function listPlans(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  userTier: "retail" | "reseller",
  nativeDB?: any,
): Promise<CustomerPlan[]> {
  networkOrBiller = normalizeNetworkOrBiller(networkOrBiller)
  const result = await d1Query(
    `SELECT plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo
     FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1 AND plan_code IS NOT NULL
     ORDER BY retail_price_kobo`,
    [serviceType, networkOrBiller],
    nativeDB,
  )

  const rows = result.results ?? []
  if (rows.length === 0) return []

  const activeProviders = await getActiveVtuProviders(serviceType, nativeDB)
  const activeProviderKeys = new Set(activeProviders.map((p) => p.providerKey))

  // Services without plan-coded provider mappings at all (airtime,
  // electricity/betting with no meter-type mapping) never had rows in
  // provider_plan_mappings to begin with — for those, provider
  // liveness is already covered by getActiveVtuProviders alone at
  // purchase time, so skip the extra join and keep prior behavior.
  //
  // Deliberately NOT filtering this query by `plan_code IN (...)` —
  // binding one parameter per plan_code blows past D1's per-statement
  // bound-parameter limit once a network has ~100+ synced plans (seen
  // live: MTN/Glo failed with 128/132 plans while Airtel/9mobile at
  // 93/59 didn't, all from the exact same code path). service_type +
  // network_or_biller already scope this tightly enough that pulling
  // every mapping row for this network and filtering plan_code in JS
  // below is cheap and removes the unbounded parameter list entirely.
  const planCodes = rows.map((r: any) => r.plan_code)
  const planCodeSet = new Set(planCodes)
  const mappingResult = await d1Query(
    `SELECT DISTINCT plan_code, provider_key FROM provider_plan_mappings
     WHERE service_type = ? AND network_or_biller = ? AND is_active = 1`,
    [serviceType, networkOrBiller],
    nativeDB,
  )
  const mappingRows = (mappingResult.results ?? []).filter((r: any) => planCodeSet.has(r.plan_code))

  // Only plan_codes that have NO mappings at all skip the liveness
  // check (nothing to check — same as before). Plan codes WITH
  // mappings must have at least one mapped provider currently enabled.
  const planCodesWithMappings = new Set(mappingRows.map((r: any) => r.plan_code))
  const planCodesWithLiveProvider = new Set(
    mappingRows.filter((r: any) => activeProviderKeys.has(r.provider_key)).map((r: any) => r.plan_code),
  )

  const wholesale = userTier === "reseller"

  const finalPlans: CustomerPlan[] = rows
    .filter((row: any) => {
      if (!planCodesWithMappings.has(row.plan_code)) return true // unmapped plan — no liveness signal to check
      return planCodesWithLiveProvider.has(row.plan_code)
    })
    // Customer-facing safety net (see isCleanPlanCode in
    // planNormalization.ts): a plan_code that still looks like a raw,
    // unnormalized provider slug (an unmapped opaque code, or a label
    // still carrying provider noise words/restated prices) never
    // reaches the buy page, even though the row itself stays active
    // and priced for admin visibility — this is a read-time filter
    // only, not a change to is_active.
    .filter((row: any) => isCleanPlanCode(row.plan_code))
    .map((row: any) => ({
      planCode: row.plan_code,
      priceKobo: (wholesale ? row.wholesale_price_kobo : row.retail_price_kobo) + row.convenience_fee_kobo,
    }))

  // Sort by the actual price shown to the customer (base price + fee),
  // not just base price — the SQL ORDER BY only sorts base price, and
  // per-plan convenience fees can push the final price out of that
  // order (e.g. two ₦100 plans with different fees end up at ₦102 and
  // ₦110, which need to be re-sorted here to stay cheapest-first).
  finalPlans.sort((a, b) => a.priceKobo - b.priceKobo)

  return finalPlans
}

// Same liveness-filtered plan list as listPlans(), grouped by
// size+validity+network so the buy page can show one line per real-
// world plan with category as a sub-choice, instead of one line per
// plan_code. See CustomerPlanGroup for why category is never
// auto-collapsed away.
export async function listPlanGroups(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  userTier: "retail" | "reseller",
  nativeDB?: any,
): Promise<CustomerPlanGroup[]> {
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const plans = await listPlans(serviceType, normalizedNetwork, userTier, nativeDB)

  const groups = new Map<string, CustomerPlanGroup>()
  for (const plan of plans) {
    // Only data plan_codes carry a category suffix worth grouping on
    // (see splitPlanCodeForGrouping) — cable's canonical code has no
    // category at all, and exam_pin/epin's plan_code is a pin type or
    // denomination, not a product variant. For every other service,
    // each plan_code is simply its own singleton group, so the buy
    // page can use one grouped rendering path for every service
    // without cable/exam_pin/epin plans being mis-split by a regex
    // that was never meant to apply to their code shape.
    const { groupKey, category } =
      serviceType === "data"
        ? splitPlanCodeForGrouping(plan.planCode, normalizedNetwork)
        : { groupKey: `${normalizedNetwork}:${plan.planCode}`, category: "standard" }
    let group = groups.get(groupKey)
    if (!group) {
      group = { groupKey, label: "", cheapestPriceKobo: plan.priceKobo, variants: [] }
      groups.set(groupKey, group)
    }
    group.variants.push({ planCode: plan.planCode, category, priceKobo: plan.priceKobo })
    if (plan.priceKobo < group.cheapestPriceKobo) group.cheapestPriceKobo = plan.priceKobo
  }

  const result = Array.from(groups.values())
  for (const group of result) {
    group.variants.sort((a, b) => a.priceKobo - b.priceKobo) // cheapest variant first
  }
  // Groups themselves cheapest-first, same ordering principle as listPlans.
  result.sort((a, b) => a.cheapestPriceKobo - b.cheapestPriceKobo)
  return result
}

export async function listPricingRules(serviceType?: VtuServiceType, nativeDB?: any) {
  const sql = serviceType
    ? "SELECT * FROM pricing_rules WHERE service_type = ? ORDER BY network_or_biller"
    : "SELECT * FROM pricing_rules ORDER BY service_type, network_or_biller"
  const result = await d1Query(sql, serviceType ? [serviceType] : [], nativeDB)
  return result.results ?? []
}

// Look up a rule by its natural key (service_type + network_or_biller +
// plan_code — this table has no UNIQUE constraint, so unlike
// provider_plan_mappings there's no DB-level upsert to lean on; the
// bulk CSV uploader uses this to decide INSERT vs UPDATE itself, and
// to tell the admin which one happened.
export async function findPricingRuleByNaturalKey(
  serviceType: VtuServiceType,
  networkOrBiller: string,
  planCode: string | null,
  nativeDB?: any,
) {
  const normalizedNetwork = normalizeNetworkOrBiller(networkOrBiller)
  const normalizedPlanCode = normalizedPlanCodeOrNull(planCode, normalizedNetwork, serviceType)
  const result = await d1Query(
    `SELECT * FROM pricing_rules
     WHERE service_type = ? AND network_or_biller = ?
       AND (plan_code = ? OR (plan_code IS NULL AND ? IS NULL))
     LIMIT 1`,
    [serviceType, normalizedNetwork, normalizedPlanCode, normalizedPlanCode],
    nativeDB,
  )
  return result.results?.[0] ?? null
}

// Every write through this function is, by definition, a human
// setting a price directly (the admin form, or a CSV row) — so it
// ALWAYS sets auto_priced = 0, taking this plan out of
// reconcilePricingFromMappings's reach until the admin explicitly
// resets it (see resetPlanToAutoPricing in pricingReconcile.ts). This
// is what makes "except if I edit one plan myself" (the bonus-price
// case) actually stick instead of getting silently overwritten the
// next time a sync or policy edit triggers a reconcile.
export async function upsertPricingRule(
  params: {
    id?: string
    serviceType: VtuServiceType
    networkOrBiller: string
    planCode: string | null
    retailPriceKobo: number
    wholesalePriceKobo: number
    convenienceFeeKobo: number
  },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  // Normalize before writing — admin form entry and CSV rows are
  // human-typed and must land on the same plan_code sync produces, or
  // a manually-priced plan silently becomes its own untouchable
  // duplicate instead of matching the provider mappings underneath it.
  const networkOrBiller = normalizeNetworkOrBiller(params.networkOrBiller)
  const planCode = normalizedPlanCodeOrNull(params.planCode, networkOrBiller, params.serviceType)
  params = { ...params, networkOrBiller, planCode }

  if (params.id) {
    await d1Query(
      `UPDATE pricing_rules SET
        network_or_biller = ?, plan_code = ?,
        retail_price_kobo = ?, wholesale_price_kobo = ?, convenience_fee_kobo = ?,
        auto_priced = 0,
        updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        params.networkOrBiller,
        params.planCode,
        params.retailPriceKobo,
        params.wholesalePriceKobo,
        params.convenienceFeeKobo,
        adminUserId,
        params.id,
      ],
      nativeDB,
    )
  } else {
    await d1Query(
      `INSERT INTO pricing_rules
        (id, service_type, network_or_biller, plan_code, retail_price_kobo, wholesale_price_kobo, convenience_fee_kobo, auto_priced, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        randomUUID(),
        params.serviceType,
        params.networkOrBiller,
        params.planCode,
        params.retailPriceKobo,
        params.wholesalePriceKobo,
        params.convenienceFeeKobo,
        adminUserId,
      ],
      nativeDB,
    )
  }
}

export async function deletePricingRule(id: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM pricing_rules WHERE id = ?", [id], nativeDB)
}
