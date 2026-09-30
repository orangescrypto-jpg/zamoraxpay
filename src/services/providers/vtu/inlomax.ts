// src/services/providers/vtu/inlomax.ts
// Inlomax VTU adapter — implements IVtuProviderAdapter.
//
// Docs: https://inlomax.com/docs/
// Live base: https://inlomax.com/api
// Sandbox base: https://inlomax.com/sandbox
// Auth: Authorization: Token <API key>
// Response envelope: { status: "success"|"processing"|"failed", message, data: {...} }
// Endpoints (all POST):
//   /api/airtime     { serviceID, amount, mobileNumber, request-id }
//   /api/data        { serviceID, mobileNumber, request-id }          (serviceID = data plan id)
//   /api/subcable     -> actually /api/validatecable & /api/subcable, see cable.ts style below
//   /api/validatecable { serviceID, iucNum }
//   /api/subcable       { serviceID, iucNum, request-id }
//   /api/validatemeter  { serviceID, meterNum, meterType (1|2) }
//   /api/payelectric    { serviceID, meterNum, meterType (1|2), amount, request-id }
//   /api/education       { serviceID, quantity, request-id }
//   POST /api/transaction { reference } — status lookup by our own reference
// Note: unlike Pairgate, Inlomax's status lookup takes the *reference we
// sent* (request-id becomes their reference, echoed back as data.reference),
// not a provider-specific transaction id — see checkStatus below.
// serviceID is Inlomax's single dial for "which network/biller/plan" —
// see https://inlomax.com/pricing for the serviceID list; we pass
// req.planCode through for data (data plans are keyed by serviceID) and
// req.networkOrBiller for airtime/cable/electricity/exam_pin.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

function resolveServiceId(req: VtuPurchaseRequest): string {
  // Data and cable plans are selected by planCode (the Inlomax serviceID
  // for that specific plan); airtime/electricity/exam_pin are selected by
  // network/biller (networkOrBiller carries the serviceID for those).
  if (req.serviceType === "data" || req.serviceType === "cable") {
    return req.planCode || req.networkOrBiller
  }
  return req.networkOrBiller
}

function buildPurchaseBody(req: VtuPurchaseRequest): Record<string, unknown> {
  switch (req.serviceType) {
    case "airtime":
      return {
        serviceID: resolveServiceId(req),
        amount: req.amountKobo / 100,
        mobileNumber: req.recipient,
        "request-id": req.internalReference,
      }
    case "data":
      return {
        serviceID: resolveServiceId(req),
        mobileNumber: req.recipient,
        "request-id": req.internalReference,
      }
    case "cable":
      return {
        serviceID: resolveServiceId(req),
        iucNum: req.recipient,
        "request-id": req.internalReference,
      }
    case "electricity":
      return {
        serviceID: resolveServiceId(req),
        meterNum: req.recipient,
        meterType: req.meterType === "postpaid" ? 2 : 1,
        amount: req.amountKobo / 100,
        "request-id": req.internalReference,
      }
    case "exam_pin":
      return {
        serviceID: resolveServiceId(req),
        quantity: req.quantity && req.quantity > 0 ? req.quantity : 1,
        "request-id": req.internalReference,
      }
    default:
      return { "request-id": req.internalReference }
  }
}

const PURCHASE_ENDPOINT: Record<string, string> = {
  airtime: "/airtime",
  data: "/data",
  cable: "/subcable",
  electricity: "/payelectric",
  exam_pin: "/education",
}

export const inlomaxAdapter: IVtuProviderAdapter = {
  key: "inlomax",
  label: "Inlomax",
  supportsServices: ["airtime", "data", "cable", "electricity", "exam_pin"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const testMode = credentials.testMode === "true" || credentials.testMode === "1"
    const baseUrl =
      credentials.baseUrl ||
      process.env.INLOMAX_BASE_URL ||
      (testMode ? "https://inlomax.com/sandbox" : "https://inlomax.com/api")
    const apiKey = credentials.apiKey || process.env.INLOMAX_API_KEY
    const endpoint = PURCHASE_ENDPOINT[req.serviceType]

    if (!apiKey) {
      return { success: false, message: "Inlomax API key not configured" }
    }
    if (!endpoint) {
      return { success: false, message: `Inlomax does not support service type: ${req.serviceType}` }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
          },
          body: JSON.stringify(buildPurchaseBody(req)),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any
      const data = json?.data
      const status = json?.status as string | undefined
      const ok = res.ok && status === "success"
      const isPending = res.ok && status === "processing"

      if (ok || isPending) {
        const deliveredData =
          req.serviceType === "exam_pin" && Array.isArray(data?.pins)
            ? { pins: data.pins.map((p: any) => ({ pin: String(p.pin).trim(), serialNumber: p.serialNo ?? p.serialNumber })) }
            : req.serviceType === "electricity" && data?.token
              ? { token: String(data.token), units: data.units }
              : undefined

        return {
          success: true,
          isPending,
          providerReference: data?.reference ?? req.internalReference,
          message: json?.message ?? "Purchase successful via Inlomax",
          deliveredData,
          raw: json,
        }
      }

      return {
        success: false,
        message: json?.message ?? "Inlomax returned a failing status",
        raw: json,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Inlomax request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const testMode = credentials.testMode === "true" || credentials.testMode === "1"
    const baseUrl =
      credentials.baseUrl ||
      process.env.INLOMAX_BASE_URL ||
      (testMode ? "https://inlomax.com/sandbox" : "https://inlomax.com/api")
    const apiKey = credentials.apiKey || process.env.INLOMAX_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "Inlomax API key not configured" }
    }

    try {
      const res = await fetchWithRetry(
        `${baseUrl}/transaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
          },
          body: JSON.stringify({ reference: providerReference }),
        },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const raw = json?.data?.status ?? json?.status
      const status = raw === "success" ? "success" : raw === "processing" ? "pending" : "failed"
      return { status, message: json?.message ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
