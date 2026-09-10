// src/services/providers/vtu/cheapdatahub.ts
// CheapDataHub VTU adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://www.cheapdatahub.ng/api_documentation/
// Live base: https://www.cheapdatahub.ng/api/v1/resellers
// Auth: Authorization: Bearer <API key>
// Responses use status: "true" (string) on success, not "success".
// Exam PIN quantity must be 1, 2, or 5 (enforced here via req.quantity,
// rounded down to the nearest allowed value). product_id (req.planCode)
// carries the pin type (registration vs. result-checker), mapped
// per-provider via provider_plan_mappings. meter_type is read from
// req.meterType (defaults to "prepaid" if unset).

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
  airtime: "/airtime/purchase/",
  data: "/data/purchase/",
  cable: "/cable/purchase/",
  electricity: "/electricity/purchase/",
  exam_pin: "/exam-pin/purchase/",
}

function buildBody(req: VtuPurchaseRequest) {
  switch (req.serviceType) {
    case "airtime":
      return {
        provider_id: req.networkOrBiller,
        phone_number: req.recipient,
        amount: req.amountKobo / 100,
      }
    case "data":
      return {
        bundle_id: req.planCode,
        phone_number: req.recipient,
      }
    case "electricity":
      return {
        disco_id: req.networkOrBiller,
        meter_number: req.recipient,
        amount: req.amountKobo / 100,
        meter_type: req.meterType === "postpaid" ? "postpaid" : "prepaid",
        phone: req.recipient,
      }
    case "cable":
      return {
        plan_id: req.planCode,
        cardnumber: req.recipient,
        phone: req.recipient,
      }
    case "exam_pin": {
      // CheapDataHub only accepts quantity 1, 2, or 5. req.planCode
      // here is the pin type ("registration" | "result_checker"),
      // mapped per-provider via provider_plan_mappings to
      // CheapDataHub's own product_id.
      const requestedQty = req.quantity && req.quantity > 0 ? req.quantity : 1
      const allowedQty = [1, 2, 5]
      const quantity = allowedQty.includes(requestedQty)
        ? requestedQty
        : allowedQty.reduce((closest, q) => (q <= requestedQty ? q : closest), 1)
      return {
        product_id: req.planCode,
        quantity,
      }
    }
    default:
      return {
        network_id: req.networkOrBiller,
        phone: req.recipient,
        amount: req.amountKobo / 100,
        plan_code: req.planCode,
        reference: req.internalReference,
      }
  }
}

// CheapDataHub's exam-PIN/electricity response field names aren't
// pinned down by public docs the way VTpass's are, so this checks
// every plausible key (seen across similar Nigerian VTU aggregators)
// rather than assuming one shape. If a real response uses a field
// name not covered here, `raw` still has everything for the admin to
// find it in the audit trail and this list should be extended.
function extractDeliveredData(req: VtuPurchaseRequest, json: any): VtuDeliveredData | undefined {
  const data = json?.data ?? json

  if (req.serviceType === "exam_pin") {
    const pinsArray = data?.pins ?? data?.cards ?? data?.epins
    if (Array.isArray(pinsArray) && pinsArray.length > 0) {
      return {
        pins: pinsArray.map((p: any) =>
          typeof p === "string"
            ? { pin: p }
            : { pin: p.pin ?? p.Pin ?? p.epin, serialNumber: p.serial ?? p.Serial ?? p.serial_number },
        ),
      }
    }
    const singlePin = data?.pin ?? data?.epin
    if (singlePin) {
      return { pins: [{ pin: singlePin, serialNumber: data?.serial ?? data?.serial_number }] }
    }
  }

  if (req.serviceType === "electricity") {
    const token = data?.token ?? data?.meter_token
    const units = data?.units ?? data?.token_units
    if (token || units) {
      return { token: token ?? undefined, units: units != null ? String(units) : undefined }
    }
  }

  return undefined
}

export const cheapdatahubAdapter: IVtuProviderAdapter = {
  key: "cheapdatahub",
  label: "CheapDataHub",
  supportsServices: ["airtime", "data", "cable", "electricity", "exam_pin"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl =
      credentials.baseUrl || process.env.CHEAPDATAHUB_BASE_URL || "https://www.cheapdatahub.ng/api/v1/resellers"
    const apiKey = credentials.apiKey || process.env.CHEAPDATAHUB_API_KEY

    if (!apiKey) {
      return { success: false, message: "CheapDataHub API key not configured" }
    }

    const endpoint = SERVICE_ENDPOINT[req.serviceType]
    if (!endpoint) {
      return { success: false, message: `CheapDataHub does not support service type: ${req.serviceType}` }
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
          body: JSON.stringify(buildBody(req)),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const ok = res.ok && (json?.status === true || json?.status === "true" || json?.status === "success")

      if (ok) {
        return {
          success: true,
          providerReference: json.transaction_id ?? json.reference ?? json.data?.reference,
          message: json?.message ?? "Purchase successful via CheapDataHub",
          deliveredData: extractDeliveredData(req, json),
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
    const baseUrl =
      credentials.baseUrl || process.env.CHEAPDATAHUB_BASE_URL || "https://www.cheapdatahub.ng/api/v1/resellers"
    const apiKey = credentials.apiKey || process.env.CHEAPDATAHUB_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "CheapDataHub API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/transactions/${providerReference}/`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const raw = json?.data?.status ?? json?.status
      const status = raw === true || raw === "true" || raw === "successful" || raw === "success"
        ? "success"
        : raw === "pending" || raw === "processing" || raw === "initiated"
          ? "pending"
          : "failed"
      const deliveredData =
        extractDeliveredData({ serviceType: "exam_pin" } as VtuPurchaseRequest, json) ??
        extractDeliveredData({ serviceType: "electricity" } as VtuPurchaseRequest, json)
      return { status, message: json?.message ?? "", deliveredData, raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
