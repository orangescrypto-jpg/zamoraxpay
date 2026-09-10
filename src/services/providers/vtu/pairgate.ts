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

function buildBody(req: VtuPurchaseRequest): Record<string, unknown> {
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
      return {
        provider_id: req.networkOrBiller.toLowerCase(),
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

    try {
      const res = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(buildBody(req)),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const data = json?.data
      const ok = res.ok && json?.status === "success" && (data?.status === true || data?.test_mode === true)

      if (ok) {
        return {
          success: true,
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
