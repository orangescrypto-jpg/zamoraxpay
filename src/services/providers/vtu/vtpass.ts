// src/services/providers/vtu/vtpass.ts
// VTpass VTU adapter — implements IVtuProviderAdapter.
//
// VTpass is one of the most established, well-documented Nigerian VTU
// aggregators and covers all service types in one API (airtime, data,
// cable, electricity, exam PINs, and betting wallet funding), making
// it a strong third/fallback option. Field names below follow VTpass's
// publicly documented request shape (serviceID, billersCode,
// variation_code, request_id) — confirm against your live account
// once you have real credentials, since exact required fields can
// vary slightly per serviceID.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

function resolveServiceId(req: VtuPurchaseRequest): string {
  // VTpass identifies billers/networks via a single `serviceID` string
  // (e.g. "mtn", "dstv", "ikeja-electric"). We pass networkOrBiller
  // through lowercased as a reasonable default mapping.
  return req.networkOrBiller.toLowerCase()
}

export const vtpassAdapter: IVtuProviderAdapter = {
  key: "vtpass",
  label: "VTpass",
  supportsServices: ["airtime", "data", "cable", "electricity", "exam_pin", "betting"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.VTPASS_BASE_URL || "https://vtpass.com/api"
    const apiKey = credentials.apiKey || process.env.VTPASS_API_KEY
    const secretKey = credentials.secretKey || process.env.VTPASS_SECRET_KEY

    if (!apiKey || !secretKey) {
      return { success: false, message: "VTpass API credentials not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/pay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
            "secret-key": secretKey,
          },
          body: JSON.stringify({
            request_id: req.internalReference,
            serviceID: resolveServiceId(req),
            billersCode: req.recipient,
            variation_code: req.planCode,
            amount: req.amountKobo / 100,
            phone: req.recipient,
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const code = json?.code

      if (res.ok && (code === "000" || json?.content?.transactions?.status === "delivered")) {
        return {
          success: true,
          providerReference: json?.content?.transactions?.transactionId ?? req.internalReference,
          message: "Purchase successful via VTpass",
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.response_description ?? "VTpass returned a failing status",
        raw: json,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "VTpass request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.VTPASS_BASE_URL || "https://vtpass.com/api"
    const apiKey = credentials.apiKey || process.env.VTPASS_API_KEY
    const secretKey = credentials.secretKey || process.env.VTPASS_SECRET_KEY

    if (!apiKey || !secretKey) {
      return { status: "failed", message: "VTpass API credentials not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/requery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
            "secret-key": secretKey,
          },
          body: JSON.stringify({ request_id: providerReference }),
        },
        { retries: 2, timeoutMs: 10_000, retryUnsafe: false },
      )
      const json = (await res.json()) as any
      const txStatus = json?.content?.transactions?.status
      const status = txStatus === "delivered" ? "success" : txStatus === "pending" ? "pending" : "failed"
      return { status, message: json?.response_description ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
