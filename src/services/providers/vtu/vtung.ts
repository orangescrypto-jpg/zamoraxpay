// src/services/providers/vtu/vtung.ts
// VTU.ng adapter — implements IVtuProviderAdapter.
//
// Fourth VTU provider, added for extra redundancy in the fallback
// chain. Field names below follow VTU.ng's general WordPress/WooCommerce
// -based API pattern (network, mobile_number, plan); confirm exact
// field names against your live account once you have real credentials.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

const SERVICE_ENDPOINT: Record<string, string> = {
  airtime: "/airtime",
  data: "/data",
  cable: "/cable",
  electricity: "/electricity",
}

export const vtungAdapter: IVtuProviderAdapter = {
  key: "vtung",
  label: "VTU.ng",
  supportsServices: ["airtime", "data", "cable", "electricity"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUNG_BASE_URL || "https://vtu.ng/wp-json/api/v2"
    const apiKey = credentials.apiKey || process.env.VTUNG_API_KEY
    const secretKey = credentials.secretKey || process.env.VTUNG_SECRET_KEY
    const endpoint = SERVICE_ENDPOINT[req.serviceType]

    if (!apiKey) {
      return { success: false, message: "VTU.ng API key not configured" }
    }
    if (!endpoint) {
      return { success: false, message: `VTU.ng does not support service type: ${req.serviceType}` }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
            ...(secretKey ? { "X-Secret-Key": secretKey } : {}),
          },
          body: JSON.stringify({
            network: req.networkOrBiller,
            mobile_number: req.recipient,
            plan: req.planCode,
            amount: req.amountKobo / 100,
            reference: req.internalReference,
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any

      if (res.ok && (json?.status === "success" || json?.success === true)) {
        return {
          success: true,
          providerReference: json.reference ?? json.id ?? req.internalReference,
          message: "Purchase successful via VTU.ng",
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? json?.error ?? "VTU.ng returned a failing status",
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
    const baseUrl = credentials.baseUrl || process.env.VTUNG_BASE_URL || "https://vtu.ng/wp-json/api/v2"
    const apiKey = credentials.apiKey || process.env.VTUNG_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "VTU.ng API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/status/${providerReference}`,
        { method: "GET", headers: { Authorization: `Token ${apiKey}` } },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const status = json?.status === "success" ? "success" : json?.status === "pending" ? "pending" : "failed"
      return { status, message: json?.message ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
