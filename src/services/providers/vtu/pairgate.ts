// src/services/providers/vtu/pairgate.ts
// Pairgate VTU adapter — implements IVtuProviderAdapter.
//
// Per the PRD, configured as the primary route for Utilities, Bills,
// and Exam PIN execution. Payload shapes follow the PRD's sample
// structure; confirm exact field names against Pairgate's live docs
// once you have real credentials.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

const SERVICE_ENDPOINT: Record<string, string> = {
  cable: "/tv",
  electricity: "/electricity",
  exam_pin: "/exam-pin",
  airtime: "/airtime",
  data: "/data",
  betting: "/betting",
}

export const pairgateAdapter: IVtuProviderAdapter = {
  key: "pairgate",
  label: "Pairgate",
  supportsServices: ["cable", "electricity", "exam_pin", "airtime", "data", "betting"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://api.pairgate.com/v1"
    const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY
    const endpoint = SERVICE_ENDPOINT[req.serviceType]

    if (!apiKey) {
      return { success: false, message: "Pairgate API key not configured" }
    }
    if (!endpoint) {
      return { success: false, message: `Pairgate does not support service type: ${req.serviceType}` }
    }

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
            biller_id: req.networkOrBiller,
            account_number: req.recipient,
            bundle_size: req.planCode,
            amount: req.amountKobo / 100,
            reference: req.internalReference,
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any

      if (res.ok && json?.status === "success") {
        return {
          success: true,
          providerReference: json.transaction_ref ?? json.reference,
          message: "Purchase successful via Pairgate",
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? "Pairgate returned a failing status",
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
    const baseUrl = credentials.baseUrl || process.env.PAIRGATE_BASE_URL || "https://api.pairgate.com/v1"
    const apiKey = credentials.apiKey || process.env.PAIRGATE_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "Pairgate API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/transactions/${providerReference}`,
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
