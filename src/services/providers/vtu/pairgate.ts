// src/services/providers/vtu/pairgate.ts
// Pairgate VTU adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://pairgate.com/developers/introduction
// Live base: https://pairgate.com/api/v1
// Auth: Authorization: Bearer <API key>
// Response envelope: { code, status: "success"|"error", data: {...} } on
// the outer object; the actual purchase result (status: true/false,
// message, reference_code, ...) lives inside `data`.
// Endpoints (all POST unless noted):
//   /data/purchase           { provider_id, plan_id, recipient, reference }
//   /airtime/purchase        { provider_id, amount, recipient, reference }
//   /cable/purchase          { provider_id, plan_id, smartcard, recipient_name?, reference }
//   /electricity/purchase    { provider_id, amount, meter_number, meter_type (1|2), recipient_name?, reference }
//   /education/purchase      { provider_id, quantity, reference }  (WAEC/NECO/NABTEB exam pins —
//                             no plan/product-id field; provider_id itself must distinguish
//                             registration vs. result-checker pins, e.g. "waec-registration" vs
//                             "waec-result-checker", set via a provider_plan_mappings override)
//   /bet/purchase             { provider_id, amount, customer_id, recipient_name?, reference }
//   GET /transaction/status?reference_code=...
//   GET /providers/betting    { data: [{ id, name, slug }] } — the REAL provider_id
//                             values for betting (e.g. "bet9ja", "sportybet",
//                             "betking", "nairabet", "betway", "accessbet").
//                             These are account-specific slugs, not something
//                             safe to derive by lowercasing our own platform
//                             label — see resolveBettingProviderSlug below,
//                             which fetches and caches this list, then
//                             matches it against the platform name the user
//                             picked on our own betting page.
// Betting funding uses a DIFFERENT path segment ("bet") than our
// internal "betting" service type — mapped below.
// Electricity token & exam pins are delivered asynchronously via
// webhook; the purchase call itself only confirms the debit succeeded
// and processing started (message says "...successful & processing.").
// Prepend /test to any endpoint to dry-run (credentials.testMode).

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

const SERVICE_ENDPOINT: Record<string, string> = {
  data: "/data/purchase",
  airtime: "/airtime/purchase",
  cable: "/cable/purchase",
  electricity: "/electricity/purchase",
  exam_pin: "/education/purchase",
  betting: "/bet/purchase",
}

// Pairgate's real betting-platform identifiers are account-specific slugs
// ("bet9ja", "sportybet", "betking", "nairabet", "betway", "accessbet", ...)
// returned by GET /providers/betting — NOT something we can safely guess by
// lowercasing our own platform label. A guess works for some names by
// coincidence (e.g. "SportyBet" → "sportybet") and silently fails for
// others (e.g. "1xBet" isn't in Pairgate's list at all), which is exactly
// the "wallet funding unavailable" failure this resolves.
// Cached briefly in-memory since this list is effectively static and
// funding requests shouldn't pay for an extra round-trip every time.
let bettingSlugCache: { at: number; byName: Map<string, string> } | null = null
const BETTING_SLUG_CACHE_MS = 10 * 60_000 // 10 minutes

// Same "strip everything but letters/digits, lowercase" normalization
// planNormalization.ts uses for network/biller names (see
// normalizeNetworkOrBiller there) — kept local here since betting platform
// names are a different identity space (no fixed label map to fall back
// to), but the same normalization logic: it's what makes "SportyBet",
// "Sporty Bet", and "sporty-bet" all match Pairgate's "Sportybet" name,
// instead of only an exact-cased, exact-spaced string matching.
function normalizeBettingName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function resolveBettingProviderSlug(
  platformLabel: string,
  baseUrl: string,
  apiKey: string,
): Promise<{ slug: string } | { error: string }> {
  const key = normalizeBettingName(platformLabel)

  if (!bettingSlugCache || Date.now() - bettingSlugCache.at > BETTING_SLUG_CACHE_MS) {
    try {
      const res = await fetchWithRetry(
        `${baseUrl}/providers/betting`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, "Cache-Control": "no-cache" } },
        { retries: 1, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      if (!res.ok || json?.status !== "success" || !Array.isArray(json?.data)) {
        // Don't cache a failed fetch — try again next call rather than being
        // stuck on an empty map for the full cache window.
        return { error: "Couldn't load Pairgate's betting provider list right now." }
      }
      const byName = new Map<string, string>()
      for (const p of json.data) {
        if (p?.name && p?.slug) byName.set(normalizeBettingName(String(p.name)), String(p.slug))
      }
      bettingSlugCache = { at: Date.now(), byName }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't reach Pairgate's betting provider list." }
    }
  }

  const slug = bettingSlugCache!.byName.get(key)
  if (!slug) {
    const known = Array.from(bettingSlugCache!.byName.keys()).join(", ")
    return { error: `Pairgate doesn't support "${platformLabel}" for betting. Supported: ${known || "none configured"}.` }
  }
  return { slug }
}

function buildBody(req: VtuPurchaseRequest, resolvedProviderId?: string): Record<string, unknown> {
  switch (req.serviceType) {
    case "data":
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
        plan_id: req.planCode,
        recipient: req.recipient,
        reference: req.internalReference,
      }
    case "airtime":
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
        amount: req.amountKobo / 100,
        recipient: req.recipient,
        reference: req.internalReference,
      }
    case "cable":
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
        plan_id: req.planCode,
        smartcard: req.recipient,
        ...(req.recipientName ? { recipient_name: req.recipientName } : {}),
        reference: req.internalReference,
      }
    case "electricity":
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
        amount: req.amountKobo / 100,
        meter_number: req.recipient,
        meter_type: req.meterType === "postpaid" ? 2 : 1,
        ...(req.recipientName ? { recipient_name: req.recipientName } : {}),
        reference: req.internalReference,
      }
    case "exam_pin":
      // No plan/product-id field exists on this endpoint — the
      // registration-vs-result-checker distinction is baked into
      // provider_id itself (e.g. "waec-result-checker" vs
      // "waec-registration"), set via a provider_plan_mappings
      // networkOrBiller override at the router level (see
      // vtuRouter.ts EXAM_PIN_NETWORK_OVERRIDE_PROVIDERS). If no
      // mapping exists yet, this falls back to the bare exam body,
      // which Pairgate will reject or mis-fulfill — an admin must add
      // a mapping before enabling Pairgate for exam_pin.
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
        quantity: req.quantity && req.quantity > 0 ? req.quantity : 1,
        reference: req.internalReference,
      }
    case "betting":
      // provider_id MUST be Pairgate's own slug (e.g. "bet9ja"), resolved
      // live via resolveBettingProviderSlug — never our own platform label
      // lowercased, since that silently breaks for names Pairgate spells
      // differently (or doesn't support at all, e.g. "1xBet"). See
      // resolveBettingProviderSlug above; purchase() below is what
      // actually resolves this before buildBody is called.
      return {
        provider_id: resolvedProviderId,
        amount: req.amountKobo / 100,
        customer_id: req.recipient,
        ...(req.recipientName ? { recipient_name: req.recipientName } : {}),
        reference: req.internalReference,
      }
    default:
      return { reference: req.internalReference }
  }
}

export const pairgateAdapter: IVtuProviderAdapter = {
  key: "pairgate",
  label: "Pairgate",
  supportsServices: ["cable", "electricity", "exam_pin", "airtime", "data", "betting"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://pairgate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY
    const endpoint = SERVICE_ENDPOINT[req.serviceType]
    const testMode = credentials.testMode === "true" || credentials.testMode === "1"

    if (!apiKey) {
      return { success: false, message: "Pairgate API key not configured" }
    }
    if (!endpoint) {
      return { success: false, message: `Pairgate does not support service type: ${req.serviceType}` }
    }

    const url = testMode ? `${baseUrl}/test${endpoint}` : `${baseUrl}${endpoint}`

    // Betting needs Pairgate's own provider slug, not our platform label —
    // resolve it live (cached) before building the request body. Every
    // other service type sends networkOrBiller straight through as before.
    let resolvedProviderId: string | undefined
    if (req.serviceType === "betting") {
      const resolved = await resolveBettingProviderSlug(req.networkOrBiller, baseUrl, apiKey)
      if ("error" in resolved) {
        return { success: false, message: resolved.error }
      }
      resolvedProviderId = resolved.slug
    }

    try {
      const res = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildBody(req, resolvedProviderId)),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const data = json?.data
      const ok = res.ok && json?.status === "success" && (data?.status === true || data?.test_mode === true)

      if (ok) {
        // Electricity tokens & exam pins are delivered asynchronously
        // via webhook — the purchase call only confirms debit +
        // processing started (see file header). Data/cable/airtime
        // messages containing "processing" mean the same thing for
        // this provider. Either way this is NOT a confirmed final
        // delivery yet.
        const msg = (data?.message ?? "").toLowerCase()
        const isPending =
          req.serviceType === "electricity" ||
          req.serviceType === "exam_pin" ||
          msg.includes("processing")
        return {
          success: true,
          isPending,
          providerReference: data?.reference_code ?? data?.reference ?? req.internalReference,
          message: data?.message ?? "Purchase successful via Pairgate",
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? data?.message ?? "Pairgate returned a failing status",
        raw: json,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Pairgate request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://pairgate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "Pairgate API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/transaction/status?reference_code=${encodeURIComponent(providerReference)}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const raw = json?.data?.status
      const status =
        raw === "successful" ? "success" : raw === "processing" || raw === "pending" ? "pending" : "failed"
      return { status, message: json?.data?.message ?? json?.message ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
