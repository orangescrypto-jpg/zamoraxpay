// src/services/providers/vtu/cheapdatahub.ts
// CheapDataHub VTU adapter — implements IVtuProviderAdapter.
//
// Per the original Zamorax Digital Ecosystem PRD, this is configured
// as the primary route for airtime/data volume. Endpoint shapes below
// follow the PRD's sample structure; adjust field names once you're
// testing against a real CheapDataHub account, since exact payload
// keys are best confirmed against their live docs.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

export const cheapdatahubAdapter: IVtuProviderAdapter = {
  key: "cheapdatahub",
  label: "CheapDataHub",
  supportsServices: ["airtime", "data"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.CHEAPDATAHUB_BASE_URL || "https://api.cheapdatahub.ng/v1"
    const apiKey = credentials.apiKey || process.env.CHEAPDATAHUB_API_KEY

    if (!apiKey) {
      return { success: false, message: "CheapDataHub API key not configured" }
    }

    const endpoint = req.serviceType === "airtime" ? "/airtime" : "/data"

    try {
      const res = await fetchWithRetry(
        `${baseUrl}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            network_id: req.networkOrBiller,
            phone: req.recipient,
            amount: req.amountKobo / 100,
            plan_code: req.planCode,
            reference: req.internalReference,
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any

      if (res.ok && json?.status === "success") {
        return {
          success: true,
          providerReference: json.transaction_id ?? json.reference,
          message: "Purchase successful via CheapDataHub",
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? "CheapDataHub returned a failing status",
        raw: json,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "CheapDataHub request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.CHEAPDATAHUB_BASE_URL || "https://api.cheapdatahub.ng/v1"
    const apiKey = credentials.apiKey || process.env.CHEAPDATAHUB_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "CheapDataHub API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/status/${providerReference}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
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
