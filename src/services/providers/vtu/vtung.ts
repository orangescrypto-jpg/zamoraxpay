// src/services/providers/vtu/vtung.ts
// VTU.ng adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://vtu.ng/api/
// Base: https://vtu.ng/wp-json
// Auth is NOT a static API key — it's JWT username/password login:
//   POST /jwt-auth/v1/token  { username, password } -> { token }
//   Authorization: Bearer <token> on every subsequent call
// Token expires after 7 days, but since this runs in a stateless
// serverless/Workers environment (no persistent in-memory cache
// across invocations), we just fetch a fresh token on every purchase
// call. Store the VTU.ng account's username + password in
// credentials.username / credentials.password (NOT an "apiKey" —
// there isn't one).
//
// Endpoints (base + these paths):
//   POST /api/v2/airtime      { request_id, phone, service_id, amount }
//   POST /api/v2/data         { request_id, phone, service_id, variation_id }
//   GET  /api/v2/variations/data?service_id=  (no auth)
//   POST /api/v2/tv           { request_id, customer_id, service_id, variation_id, subscription_type?, amount? }
//   GET  /api/v2/variations/tv?service_id=  (no auth)
//   POST /api/v2/electricity  { request_id, customer_id, service_id, variation_id: "prepaid"|"postpaid", amount }
//   POST /api/v2/betting      { request_id, customer_id, service_id, amount }
//   POST /api/v2/epins        { request_id, service_id, value, quantity }  (exam pin / recharge card printing — NOT exam checker pins)
//   POST /api/v2/requery      { request_id }
// service_id values differ per service type (network slug for
// airtime/data; "dstv"/"gotv"/"startimes"/"showmax" for cable;
// disco slugs like "ikeja-electric" for electricity; provider names
// like "Bet9ja" for betting — passed through as networkOrBiller).
//
// Note: VTU.ng's public API does not offer WAEC/NECO/NABTEB exam
// checker pins — only network recharge-card ePINs — so exam_pin is
// NOT in supportsServices below (was incorrectly claimed before).

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
  VtuDeliveredData,
} from "@/src/services/providers/vtu/types"

const SERVICE_ENDPOINT: Record<string, string> = {
  airtime: "/api/v2/airtime",
  data: "/api/v2/data",
  cable: "/api/v2/tv",
  electricity: "/api/v2/electricity",
  betting: "/api/v2/betting",
}

async function getToken(baseUrl: string, credentials: VtuProviderCredentials): Promise<string | null> {  const username = credentials.username || process.env.VTUNG_USERNAME
  const password = credentials.password || process.env.VTUNG_PASSWORD
  if (!username || !password) return null

  try {
    const res = await fetchWithRetry(
      `${baseUrl}/jwt-auth/v1/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
      { retries: 1, timeoutMs: 10_000, retryUnsafe: false },
    )
    const json = (await res.json()) as any
    return res.ok ? json?.token ?? null : null
  } catch {
    return null
  }
}

function buildBody(req: VtuPurchaseRequest): Record<string, unknown> {
  const requestId = req.internalReference.slice(0, 50)
  switch (req.serviceType) {
    case "airtime":
      return {
        request_id: requestId,
        phone: req.recipient,
        service_id: req.networkOrBiller.toLowerCase(),
        amount: req.amountKobo / 100,
      }
    case "data":
      return {
        request_id: requestId,
        phone: req.recipient,
        service_id: req.networkOrBiller.toLowerCase(),
        variation_id: req.planCode,
      }
    case "cable":
      return {
        request_id: requestId,
        customer_id: req.recipient,
        service_id: req.networkOrBiller.toLowerCase(),
        variation_id: req.planCode,
        subscription_type: "renew",
      }
    case "electricity":
      return {
        request_id: requestId,
        customer_id: req.recipient,
        service_id: req.networkOrBiller.toLowerCase(),
        variation_id: req.meterType === "postpaid" ? "postpaid" : "prepaid",
        amount: req.amountKobo / 100,
      }
    case "betting":
      return {
        request_id: requestId,
        customer_id: req.recipient,
        service_id: req.networkOrBiller,
        amount: req.amountKobo / 100,
      }
    default:
      return { request_id: requestId }
  }
}

// VTU.ng's electricity response docs aren't public enough to pin an
// exact field name, so this checks the plausible common shapes
// (mirroring the pattern used for the other adapters); if a real
// response uses something else, `raw` still has it for the admin.
function extractDeliveredData(json: any): VtuDeliveredData | undefined {
  const data = json?.data
  const token = data?.token ?? data?.meter_token ?? json?.token
  const units = data?.units ?? json?.units
  if (token || units) {
    return { token: token ?? undefined, units: units != null ? String(units) : undefined }
  }
  return undefined
}

export const vtungAdapter: IVtuProviderAdapter = {
  key: "vtung",
  label: "VTU.ng",
  supportsServices: ["airtime", "data", "cable", "electricity", "betting"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUNG_BASE_URL || "https://vtu.ng/wp-json"
    const endpoint = SERVICE_ENDPOINT[req.serviceType]

    if (!endpoint) {
      return { success: false, message: `VTU.ng does not support service type: ${req.serviceType}` }
    }

    const token = await getToken(baseUrl, credentials)
    if (!token) {
      return { success: false, message: "VTU.ng authentication failed — check username/password credentials" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildBody(req)),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const data = json?.data
      // VTU.ng returns code:"success" with a status string inside data
      // that can be processing-api / completed-api / refunded / etc.
      // Only "refunded" (all providers failed) or an explicit error
      // code counts as a hard failure here — "processing-api" and
      // "completed-api" both mean the debit went through and the
      // order is in flight, which the router should treat as success
      // (status is then tracked via requery/webhook).
      const status = data?.status as string | undefined
      const ok = res.ok && json?.code === "success" && status !== "refunded" && status !== "cancelled" && status !== "failed"

      if (ok) {
        return {
          success: true,
          providerReference: data?.request_id ?? req.internalReference,
          message: json?.message ?? "Purchase successful via VTU.ng",
          deliveredData: req.serviceType === "electricity" ? extractDeliveredData(json) : undefined,
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? "VTU.ng returned a failing status",
        raw: json,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "VTU.ng request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUNG_BASE_URL || "https://vtu.ng/wp-json"

    const token = await getToken(baseUrl, credentials)
    if (!token) {
      return { status: "failed", message: "VTU.ng authentication failed — check username/password credentials" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/api/v2/requery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ request_id: providerReference }),
        },
        { retries: 2, timeoutMs: 10_000, retryUnsafe: false },
      )
      const json = (await res.json()) as any
      const raw = json?.data?.status as string | undefined
      const status =
        raw === "completed-api"
          ? "success"
          : raw === "refunded" || raw === "cancelled" || raw === "failed"
            ? "failed"
            : "pending"
      return { status, message: json?.message ?? "", deliveredData: extractDeliveredData(json), raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
