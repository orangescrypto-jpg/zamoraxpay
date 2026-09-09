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
  VtuDeliveredData,
} from "@/src/services/providers/vtu/types"

function resolveServiceId(req: VtuPurchaseRequest): string {
  // VTpass identifies billers/networks via a single `serviceID` string
  // (e.g. "mtn", "dstv", "ikeja-electric"). We pass networkOrBiller
  // through lowercased as a reasonable default mapping.
  return req.networkOrBiller.toLowerCase()
}

// VTpass's exam-PIN and electricity responses put the customer-facing
// value in different, service-specific fields (and disco field casing
// for electricity is inconsistent — see vtpass docs, "Token" vs
// "token" vs "purchased_code"). We check every known shape rather than
// picking one, since sending the wrong (unmapped) shape silently loses
// the customer's PIN/token instead of erroring loudly.
function extractDeliveredData(req: VtuPurchaseRequest, json: any): VtuDeliveredData | undefined {
  if (req.serviceType === "exam_pin") {
    // WAEC Result Checker / NABTEB style: a `cards` array of {Serial, Pin}.
    if (Array.isArray(json?.cards) && json.cards.length > 0) {
      return {
        pins: json.cards.map((c: any) => ({
          pin: c.Pin ?? c.pin,
          serialNumber: c.Serial ?? c.serial,
        })),
      }
    }
    // WAEC/JAMB Registration style: a `tokens` array of plain PIN strings.
    if (Array.isArray(json?.tokens) && json.tokens.length > 0) {
      return { pins: json.tokens.map((t: string) => ({ pin: t })) }
    }
    // Last-resort fallback: `purchased_code` is a free-text string
    // VTpass includes on every PIN-vending product (e.g. "Serial
    // No:WRN123456790, pin: 098765432112"), so if the two structured
    // shapes above are both absent, still surface something rather
    // than silently dropping the PIN the customer paid for.
    if (typeof json?.purchased_code === "string" && json.purchased_code.trim()) {
      return { pins: [{ pin: json.purchased_code }] }
    }
  }

  if (req.serviceType === "electricity") {
    const token = json?.Token ?? json?.token ?? json?.content?.Token ?? json?.content?.token
    const units = json?.PurchasedUnits ?? json?.units ?? json?.content?.PurchasedUnits ?? json?.content?.units
    if (token || units) {
      return { token: token ?? undefined, units: units != null ? String(units) : undefined }
    }
    if (typeof json?.purchased_code === "string" && json.purchased_code.trim()) {
      return { token: json.purchased_code }
    }
  }

  return undefined
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
          deliveredData: extractDeliveredData(req, json),
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
      // We don't know the original serviceType here (checkStatus only
      // gets the reference), so try both exam_pin and electricity
      // extraction shapes — the fields don't collide, so this is safe.
      const deliveredData =
        extractDeliveredData({ serviceType: "exam_pin" } as VtuPurchaseRequest, json) ??
        extractDeliveredData({ serviceType: "electricity" } as VtuPurchaseRequest, json)
      return { status, message: json?.response_description ?? "", deliveredData, raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
