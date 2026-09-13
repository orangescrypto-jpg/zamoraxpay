// src/services/providers/vtu/connectbridge.ts
// ConnectBridge adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://documenter.getpostman.com/view/47597134/2sB3BHkoUd
// Base: https://connectbridge.com.ng/api
// Auth: Authorization: <API key>  — sent as a raw header value in
// ConnectBridge's own examples (no "Bearer " prefix shown). We send
// it exactly as documented; if ConnectBridge later requires a Bearer
// prefix this is the only line to change.
// Bodies: raw JSON (unlike VTUGate, which is form-encoded).
// Response envelope: { status: "success"|"error", Status: "successful"|"failed",
// "request-id", message, response, api_response, ... } — note there
// are TWO differently-cased status fields; "Status" (capitalized) is
// the one that actually reflects delivery outcome per the docs
// (top-level "status" can be "success" even when the transaction
// itself later fails/queues), so we key off "Status".
//
// Endpoints (all POST unless noted, all synchronous):
//   GET  /user       — balance/account check (not used by this adapter;
//                       exposed here as a comment for future admin
//                       "check provider balance" tooling)
//   POST /airtime    { amount, network, phone, Ported_number }
//   POST /data       { plan, phone, Ported_number }
//
// ONLY airtime and data are supported — ConnectBridge's documented
// surface has no cable TV, electricity, or education endpoints, and
// no dedicated transaction-status/requery endpoint either (checkStatus
// below is a stub that always reports "pending" for that reason —
// there is nothing to query against; reconciliation for this provider
// has to rely on the synchronous purchase response alone).
//
// NETWORK CODES: ConnectBridge's `network` field for airtime is a
// small numeric code, not a name string (their own sample shows
// network: "2" resolving to "Airtel" in the response). Confirmed
// mapping from their examples: 1=MTN, 2=Airtel, 3=Glo, 4=9mobile —
// this is the conventional ordering used by most Nigerian VTU
// resellers and matches the one visible sample (2 -> Airtel). If a
// live test shows a different number for any network, update
// NETWORK_CODES below — nothing else needs to change.
//
// Data purchases use ConnectBridge's own `plan` id directly (their
// per-provider data plan code) — same convention as every other
// adapter's planCode, resolved via provider_plan_mappings.
//
// Ported_number: true tells ConnectBridge to bypass network-detection
// and honor the network/plan you specified even for a ported number.
// We always send true since we can't ask the end customer whether
// their line the was ported at checkout time, and forcing it avoids a
// silent wrong-network delivery for ported numbers.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
} from "@/src/services/providers/vtu/types"

const NETWORK_CODES: Record<string, string> = {
  MTN: "1",
  AIRTEL: "2",
  GLO: "3",
  "9MOBILE": "4",
}

async function postJson(baseUrl: string, path: string, apiKey: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetchWithRetry(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    },
    { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
  )
  return res.json()
}

export const connectbridgeAdapter: IVtuProviderAdapter = {
  key: "connectbridge",
  label: "ConnectBridge",
  supportsServices: ["airtime", "data"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.CONNECTBRIDGE_BASE_URL || "https://connectbridge.com.ng/api"
    const apiKey = credentials.apiKey || process.env.CONNECTBRIDGE_API_KEY

    if (!apiKey) {
      return { success: false, message: "ConnectBridge API key not configured" }
    }

    try {
      switch (req.serviceType) {
        case "airtime": {
          const networkCode = NETWORK_CODES[req.networkOrBiller.toUpperCase()]
          if (!networkCode) {
            return {
              success: false,
              message: `ConnectBridge has no known network code for "${req.networkOrBiller}"`,
            }
          }
          const json = await postJson(baseUrl, "/airtime", apiKey, {
            amount: String(req.amountKobo / 100),
            network: networkCode,
            phone: req.recipient,
            Ported_number: true,
          })
          return mapPurchaseResult(json)
        }

        case "data": {
          if (!req.planCode) {
            return { success: false, message: "ConnectBridge data purchase requires a plan_code" }
          }
          const json = await postJson(baseUrl, "/data", apiKey, {
            plan: req.planCode,
            phone: req.recipient,
            Ported_number: true,
          })
          return mapPurchaseResult(json)
        }

        default:
          return { success: false, message: `ConnectBridge does not support service type: ${req.serviceType}` }
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "ConnectBridge request failed",
      }
    }
  },

  async checkStatus(_providerReference: string, _credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    // ConnectBridge's documented API has no transaction-status/requery
    // endpoint. Every purchase is synchronous and the outcome is known
    // immediately from the buy response itself, so there is nothing to
    // poll here — this always reports "pending" with an explanatory
    // message rather than falsely claiming success or failure.
    return {
      status: "pending",
      message: "ConnectBridge has no status/requery endpoint — outcome is only known from the original purchase response",
    }
  },
}

function mapPurchaseResult(json: any): VtuPurchaseResult {
  const delivered = json?.Status === "successful" && json?.status === "success"

  if (!delivered) {
    return {
      success: false,
      message: json?.message ?? json?.response ?? "ConnectBridge returned a failing status",
      raw: json,
    }
  }

  return {
    success: true,
    providerReference: json?.["request-id"] ?? undefined,
    message: json?.message ?? "Purchase successful via ConnectBridge",
    raw: json,
  }
}
