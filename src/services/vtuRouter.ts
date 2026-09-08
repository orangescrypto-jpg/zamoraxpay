// src/services/vtuRouter.ts
// Service abstraction layer — the neutral VTU fallback router.
//
// This is the piece that fulfills "don't hardcode any VTU API." It:
//   1. Asks src/services/config.ts which providers are enabled for the
//      requested service type, in admin-configured priority order.
//   2. Tries provider #1. If it fails/times out, falls through to #2,
//      then #3, then #4 — SEQUENTIALLY, never in parallel (parallel
//      would risk double-charging the float wallet on two providers
//      for one purchase).
//   3. Logs every attempt (provider tried, result) so the admin
//      provider-health dashboard and the order's audit trail both have
//      full visibility into what happened.
//
// Checkout routes call ONLY this file. They never import a specific
// adapter directly — that would reintroduce the hardcoding this
// architecture exists to avoid.

import { getVtuAdapter } from "@/src/services/providers/vtu/registry"
import { getActiveVtuProviders, getVtuProviderCredentials } from "@/src/services/config"
import type { VtuPurchaseRequest, VtuPurchaseResult } from "@/src/services/providers/vtu/types"

export interface VtuRouterAttemptLog {
  providerKey: string
  success: boolean
  message: string
  attemptedAt: string
}

export interface VtuRouterResult {
  success: boolean
  providerUsed: string | null
  providerReference: string | null
  message: string
  attempts: VtuRouterAttemptLog[]
}

export async function executeVtuPurchase(
  req: VtuPurchaseRequest,
  nativeDB?: any,
): Promise<VtuRouterResult> {
  const candidates = await getActiveVtuProviders(req.serviceType, nativeDB)
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

    let result: VtuPurchaseResult
    try {
      result = await adapter.purchase(req, credentials)
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

    // Failed — the loop continues to the next priority candidate
    // automatically. This IS the fallback chain; no separate
    // "retry with backup" call is needed.
  }

  return {
    success: false,
    providerUsed: null,
    providerReference: null,
    message: "All enabled VTU providers failed to fulfil this order. The wallet debit for this order should be reversed.",
    attempts,
  }
}
