// src/services/vtuRouter.ts
// Service abstraction layer — the neutral VTU fallback router.
//
// This is the piece that fulfills "don't hardcode any VTU API." It:
//   1. For plan-coded services (data, cable) where the SAME plan has
//      been mapped to more than one provider (see
//      providerPlanMappings.ts), tries the CHEAPEST enabled provider
//      for that specific plan first, falling through to the next
//      cheapest on failure. This is what lets "MTN 200MB/1-Day is
//      ₦92 on Pairgate vs ₦100 on CheapDataHub" resolve to Pairgate
//      automatically, without the admin having to hand-pick a global
//      priority order that fits every plan at once.
//   2. For anything without plan-specific cost mappings (airtime,
//      electricity, exam pins, betting, or a data/cable plan nobody
//      has mapped across providers yet), falls back to the admin's
//      configured priority order from config.ts — unchanged behavior.
//   3. Either way, providers are tried SEQUENTIALLY, never in
//      parallel (parallel would risk double-charging the float
//      wallet on two providers for one purchase).
//   4. Logs every attempt (provider tried, result) so the admin
//      provider-health dashboard and the order's audit trail both have
//      full visibility into what happened.
//
// Checkout routes call ONLY this file. They never import a specific
// adapter directly — that would reintroduce the hardcoding this
// architecture exists to avoid.

import { getVtuAdapter } from "@/src/services/providers/vtu/registry"
import { getActiveVtuProviders, getVtuProviderCredentials } from "@/src/services/config"
import { getPlanProviderOptions } from "@/src/services/providerPlanMappings"
import type { VtuPurchaseRequest, VtuPurchaseResult } from "@/src/services/providers/vtu/types"

export interface VtuRouterAttemptLog {
  providerKey: string
  success: boolean
  message: string
  attemptedAt: string
  raw?: unknown
}

export interface VtuRouterResult {
  success: boolean
  providerUsed: string | null
  providerReference: string | null
  message: string
  attempts: VtuRouterAttemptLog[]
}

interface RouteCandidate {
  providerKey: string
  // The plan code to actually send to THIS provider's adapter — either
  // their own mapped provider_plan_id (cost-based route) or our
  // shared planCode unchanged (priority-order fallback route, where
  // no per-provider mapping exists and every adapter is assumed to
  // use the same plan code — true today since all 4 adapters take a
  // provider-specific code anyway and admins are expected to add a
  // mapping once they notice a mismatch).
  planCodeOverride?: string
}

async function resolveCandidates(req: VtuPurchaseRequest, nativeDB?: any): Promise<RouteCandidate[]> {
  const activeProviders = await getActiveVtuProviders(req.serviceType, nativeDB)
  const activeProviderKeys = new Set<string>(activeProviders.map((p) => p.providerKey))

  // Cost-based routing only applies to plan-coded services where we
  // actually have a planCode to look up (data, cable — exam_pin's
  // planCode is a quantity, not a plan, so it's excluded).
  if (req.planCode && (req.serviceType === "data" || req.serviceType === "cable")) {
    const options = await getPlanProviderOptions(req.serviceType, req.networkOrBiller, req.planCode, nativeDB)
    const enabledOptions = options.filter((o) => activeProviderKeys.has(o.providerKey))

    if (enabledOptions.length > 0) {
      // getPlanProviderOptions already returns cheapest-first. Any
      // enabled provider NOT covered by a mapping is appended after,
      // in admin priority order, as a last-resort fallback using our
      // own planCode (best-effort — may not match that provider's
      // actual plan ID, but better than not trying at all).
      const mappedKeys = new Set(enabledOptions.map((o) => o.providerKey))
      const unmapped = activeProviders.filter((p) => !mappedKeys.has(p.providerKey))

      return [
        ...enabledOptions.map((o) => ({ providerKey: o.providerKey, planCodeOverride: o.providerPlanId })),
        ...unmapped.map((p) => ({ providerKey: p.providerKey })),
      ]
    }
  }

  // No plan mappings apply — fall back to the admin's configured
  // priority order, unchanged from prior behavior.
  return activeProviders.map((p) => ({ providerKey: p.providerKey }))
}

export async function executeVtuPurchase(
  req: VtuPurchaseRequest,
  nativeDB?: any,
): Promise<VtuRouterResult> {
  const candidates = await resolveCandidates(req, nativeDB)
  const attempts: VtuRouterAttemptLog[] = []

  if (candidates.length === 0) {
    return {
      success: false,
      providerUsed: null,
      providerReference: null,
      message: `No enabled VTU provider supports "${req.serviceType}". An admin must enable at least one provider for this service in the Admin Panel.`,
      attempts,
    }
  }

  for (const candidate of candidates) {
    const adapter = getVtuAdapter(candidate.providerKey)
    if (!adapter) {
      attempts.push({
        providerKey: candidate.providerKey,
        success: false,
        message: "No adapter implementation registered for this provider key",
        attemptedAt: new Date().toISOString(),
      })
      continue
    }

    const credentials = await getVtuProviderCredentials(candidate.providerKey, nativeDB)
    const candidateReq: VtuPurchaseRequest = candidate.planCodeOverride
      ? { ...req, planCode: candidate.planCodeOverride }
      : req

    let result: VtuPurchaseResult
    try {
      result = await adapter.purchase(candidateReq, credentials)
    } catch (err) {
      result = {
        success: false,
        message: err instanceof Error ? err.message : "Unexpected adapter error",
      }
    }

    attempts.push({
      providerKey: candidate.providerKey,
      success: result.success,
      message: result.message,
      attemptedAt: new Date().toISOString(),
      raw: result.raw,
    })

    if (result.success) {
      return {
        success: true,
        providerUsed: candidate.providerKey,
        providerReference: result.providerReference ?? null,
        message: result.message,
        attempts,
      }
    }

    // Failed — the loop continues to the next candidate (next
    // cheapest provider, or next priority provider) automatically.
    // This IS the fallback chain; no separate "retry with backup"
    // call is needed.
  }

  return {
    success: false,
    providerUsed: null,
    providerReference: null,
    message: "All enabled VTU providers failed to fulfil this order. The wallet debit for this order should be reversed.",
    attempts,
  }
}
