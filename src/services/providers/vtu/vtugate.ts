// src/services/providers/vtu/vtugate.ts
// VTUGate adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://vtugate.com/docs
// Base: https://api.vtugate.com/api/v1
// Auth: Authorization: Bearer <API key>
// Bodies: application/x-www-form-urlencoded (NOT JSON — every other
// adapter in this codebase sends JSON; VTUGate is the odd one out).
// Response envelope: { status: true|false, message, data: {...} } —
// note VTUGate's outer field is "status" (boolean), not "code"/"status"
// string like Pairgate. `data.provider_status` mirrors the same
// true/false at the inner level.
//
// Endpoints (all POST, all synchronous — final result comes back in
// the same response, no webhook needed):
//   /buyairtime         { service_id, phone_number, amount }
//   /buydata             { service_id, phone_number, amount, plan_code }
//   /verifycabletv        { service_id, phone, smartcard_number }  (required before buy)
//   /buycabletv          { service_id, phone, smartcard_number, amount, plan_code, plan_name }
//   /verifyelectricity    { service_id, meter_no, disco }          (required before buy)
//   /buyelectricity      { service_id, meter_no, disco, amount, phone_number }
//   /buyeducation        { service_id, phone, quantity, product_code }
//   /transactionstatus   { transaction_id | external_reference, requery }
//
// service_id is VTUGate's own per-network/biller identifier (NOT a
// plan code) — it must be resolved from networkOrBiller via a
// provider_plan_mappings row (see vtuRouter's networkOrBillerOverride
// path) or a dedicated service_id lookup, since VTUGate has no
// generic "pass network name as string" field the way other
// providers do. Until an admin maps service_id per network/biller,
// this adapter falls back to treating networkOrBiller AS the
// service_id (works if the admin has entered the numeric ID directly
// into that field instead of a name — best-effort, same convention
// used by the "unmapped" fallback path in vtuRouter.ts).
//
// Cable/electricity require a Verify call before Buy per VTUGate's
// docs (server re-validates and re-prices at buy time regardless).
// We call verify first, then buy, inside the same purchase() so the
// router/checkout flow doesn't need to know about this two-step
// requirement — it's an internal implementation detail of this one
// adapter.
//
// Exam pins: VTUGate's /buyeducation has a `product_code` field
// (unlike Pairgate, which has none) — req.networkOrBiller carries our
// WAEC/NECO/NABTEB/JAMB code straight through, no override needed.
// It has no separate registration-vs-result-checker field either;
// same convention as Pairgate — bake the distinction into
// product_code via a provider_plan_mappings override if needed later.
//
// Sandbox: swap in the VTUGate Test API Key to get mocked responses.
// A phone/meter/smartcard number ending in "1111" simulates failure;
// anything else simulates success (education: quantity >= 999 fails).

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

function formBody(fields: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return params
}

async function postForm(
  baseUrl: string,
  path: string,
  apiKey: string,
  fields: Record<string, string | number | boolean | undefined>,
): Promise<any> {
  const res = await fetchWithRetry(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${apiKey}`,
      },
      body: formBody(fields),
    },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  return res.json()
}

export const vtugateAdapter: IVtuProviderAdapter = {
  key: "vtugate",
  label: "VTUGate",
  supportsServices: ["airtime", "data", "cable", "electricity", "exam_pin"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY

    if (!apiKey) {
      return { success: false, message: "VTUGate API key not configured" }
    }

    // service_id is a per-network/biller identifier VTUGate assigns —
    // resolved via a provider_plan_mappings networkOrBiller override at
    // the router level. Falls back to networkOrBiller itself if no
    // mapping exists (works only if that field already holds the raw
    // numeric service_id).
    const serviceId = req.networkOrBiller

    try {
      switch (req.serviceType) {
        case "airtime": {
          const json = await postForm(baseUrl, "/buyairtime", apiKey, {
            service_id: serviceId,
            phone_number: req.recipient,
            amount: req.amountKobo / 100,
          })
          return mapPurchaseResult(json)
        }

        case "data": {
          if (!req.planCode) {
            return { success: false, message: "VTUGate data purchase requires a plan_code" }
          }
          const json = await postForm(baseUrl, "/buydata", apiKey, {
            service_id: serviceId,
            phone_number: req.recipient,
            amount: req.amountKobo / 100,
            plan_code: req.planCode,
          })
          return mapPurchaseResult(json)
        }

        case "cable": {
          if (!req.planCode) {
            return { success: false, message: "VTUGate cable purchase requires a plan_code" }
          }
          // VTUGate requires a Verify call before Buy — the smartcard
          // must be validated and the plan catalog re-checked. Buy
          // still needs plan_name, which only Verify's cable_plans
          // array provides, so we always look it up fresh rather than
          // trusting a plan_name the caller might pass in.
          const verifyJson = await postForm(baseUrl, "/verifycabletv", apiKey, {
            service_id: serviceId,
            phone: req.recipient,
            smartcard_number: req.recipient,
          })
          if (!verifyJson?.status || !verifyJson?.data?.provider_status) {
            return {
              success: false,
              message: verifyJson?.message ?? "VTUGate smartcard verification failed",
              raw: verifyJson,
            }
          }
          const matchedPlan = (verifyJson.data.cable_plans ?? []).find((p: any) => p.code === req.planCode)
          if (!matchedPlan) {
            return {
              success: false,
              message: `VTUGate has no cable plan matching code "${req.planCode}" for this smartcard`,
              raw: verifyJson,
            }
          }
          const json = await postForm(baseUrl, "/buycabletv", apiKey, {
            service_id: serviceId,
            phone: req.recipient,
            smartcard_number: req.recipient,
            amount: matchedPlan.price,
            plan_code: matchedPlan.code,
            plan_name: matchedPlan.name,
          })
          return mapPurchaseResult(json)
        }

        case "electricity": {
          // Verify first (confirms the meter/customer name) — result
          // isn't otherwise used here since Buy re-verifies server-side,
          // but skipping it would violate VTUGate's documented flow and
          // risks vending to an unverified meter.
          const verifyJson = await postForm(baseUrl, "/verifyelectricity", apiKey, {
            service_id: serviceId,
            meter_no: req.recipient,
            disco: req.networkOrBiller,
          })
          if (!verifyJson?.status || !verifyJson?.data?.provider_status) {
            return {
              success: false,
              message: verifyJson?.message ?? "VTUGate meter verification failed",
              raw: verifyJson,
            }
          }
          // VTUGate's /buyelectricity requires phone_number, used for
          // an SMS receipt. Prefer the caller-supplied contactPhone
          // (threaded through from the user's account phone by
          // purchaseFlow.ts / auto-reload — see VtuPurchaseRequest in
          // types.ts), falling back to recipientName if some future
          // caller repurposes that field, then a placeholder so the
          // purchase never blocks on a missing contact number — the
          // router already picked VTUGate for a good reason, and this
          // field is receipt-only, not a delivery target.
          const receiptPhone = req.contactPhone || req.recipientName || "08000000000"
          const json = await postForm(baseUrl, "/buyelectricity", apiKey, {
            service_id: serviceId,
            meter_no: req.recipient,
            disco: req.networkOrBiller,
            amount: req.amountKobo / 100,
            phone_number: receiptPhone,
          })
          return mapPurchaseResult(json, verifyJson)
        }

        case "exam_pin": {
          const json = await postForm(baseUrl, "/buyeducation", apiKey, {
            service_id: serviceId,
            phone: req.recipient,
            quantity: req.quantity && req.quantity > 0 ? req.quantity : 1,
            product_code: req.networkOrBiller,
          })
          return mapPurchaseResult(json)
        }

        default:
          return { success: false, message: `VTUGate does not support service type: ${req.serviceType}` }
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "VTUGate request failed",
      }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY

    if (!apiKey) {
      return { status: "failed", message: "VTUGate API key not configured" }
    }

    try {
      const json = await postForm(baseUrl, "/transactionstatus", apiKey, {
        external_reference: providerReference,
        requery: true,
      })
      const raw = json?.data?.status
      const status = raw === "success" ? "success" : raw === "pending" ? "pending" : "failed"
      return { status, message: json?.data?.provider_message ?? json?.message ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}

function mapPurchaseResult(json: any, extra?: any): VtuPurchaseResult {
  const data = json?.data
  const ok = json?.status === true && data?.provider_status === true

  if (!ok) {
    return {
      success: false,
      message: json?.message ?? data?.provider_message ?? "VTUGate returned a failing status",
      raw: json,
    }
  }

  // provider_status: true is VTUGate's own explicit delivery
  // confirmation (distinct from other providers' ambiguous "accepted"
  // codes) — but still defensively treat an explicit "processing"
  // wording in the message as not-yet-final, same pattern used for
  // every other adapter here.
  const msg = (json?.message ?? data?.provider_message ?? "").toLowerCase()
  return {
    success: true,
    isPending: msg.includes("processing"),
    providerReference: data?.external_reference ?? String(data?.transaction_id ?? ""),
    message: json?.message ?? data?.provider_message ?? "Purchase successful via VTUGate",
    deliveredData: buildDeliveredData(data),
    raw: extra ? { verify: extra, purchase: json } : json,
  }
}

function buildDeliveredData(data: any) {
  if (!data) return undefined
  if (data.token) {
    return { token: data.token, units: data.units || undefined }
  }
  if (Array.isArray(data.pins) && data.pins.length > 0) {
    return {
      pins: data.pins.map((p: any) => (typeof p === "string" ? { pin: p } : { pin: p.pin, serialNumber: p.serial })),
    }
  }
  return undefined
}
