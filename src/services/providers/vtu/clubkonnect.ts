// src/services/providers/vtu/clubkonnect.ts
// ClubKonnect (Nellobyte Systems) adapter — implements IVtuProviderAdapter.
//
// Verified against live docs: https://www.clubkonnect.com/APIDocs.asp
// Base: https://www.nellobytesystems.com
// Auth: UserID + APIKey as plain GET query params on every request —
// no bearer token, no signing. Store as credentials.userId /
// credentials.apiKey.
//
// Unlike VTUGate/VTU.ng, ClubKonnect has NO single universal endpoint —
// each service has its own .asp path and its own parameter names:
//   Airtime:      GET /APIAirtimeV1.asp      MobileNetwork, Amount, MobileNumber
//   Data:         GET /APIDatabundleV1.asp   MobileNetwork, DataPlan, MobileNumber
//   Cable TV:     GET /APICableTVV1.asp      CableTV, Package, SmartCardNo, PhoneNo
//                 (preceded by GET /APIVerifyCableTVV1.asp — see note below)
//   Electricity:  GET /APIElectricityV1.asp  ElectricCompany, MeterType, MeterNo, Amount, PhoneNo
//                 (preceded by GET /APIVerifyElectricityV1.asp — see note below)
//   Betting:      GET /APIBettingV1.asp      BettingCompany, CustomerID, Amount
//   Airtime ePIN: GET /APIEPINV1.asp         MobileNetwork, Value, Quantity
//   Data ePIN:    GET /APIDatabundleEPINV1.asp  MobileNetwork, DataPlan, Quantity
// Shared across all services:
//   Query: GET /APIQueryV1.asp?OrderID=.. or ?RequestID=..
//   Cancel: GET /APICancelV1.asp?OrderID=..
//
// Mobile network codes are fixed: 01=MTN, 02=Glo, 03=9mobile/Etisalat, 04=Airtel.
//
// Live no-auth pricing/plan-list endpoints (see syncClubkonnectPlans in
// providerPlanSync.ts) — these need only ?UserID=, not the APIKey:
//   /APIDatabundleNetworkV2.asp   /APIDatabundlePlansV2.asp
//   /APIAirtimeNetworkV2.asp      /APICableTVTypeV2.asp
//   /APICableTVPackagesV2.asp     /APIBettingTypeV2.asp
//   /APIWAECPackagesV2.asp        /APIJAMBPackagesV2.asp
//   /APISmilePackagesV2.asp       /APIEPINDiscountV2.asp
//
// Response shape is consistent across services: { orderid, statuscode,
// status } on submit, with "ORDER_RECEIVED" as the only success value
// at submission time (actual success/failure is async — reconcile via
// APIQueryV1 or the CallBackURL). Electricity purchases can return
// meter token synchronously in the same response.
//
// Cable/electricity: ClubKonnect's docs explicitly recommend calling
// their Verify endpoint (APIVerifyCableTVV1 / APIVerifyElectricityV1)
// before Buy, to confirm the smartcard/meter belongs to the intended
// customer — this adapter does that automatically inside purchase(),
// same as vtugate.ts's own verify-then-buy step, so the router/checkout
// flow never needs to know about this two-call requirement.
//
// exam_pin here covers both WAEC and JAMB — ClubKonnect exposes them
// as two separate .asp endpoints (APIWAECV1 / APIJAMBV1) rather than
// one endpoint with an ExamType switch across providers, so
// req.networkOrBiller selects which underlying endpoint to hit
// ("WAEC" vs "JAMB"), and req.planCode carries their ExamType value
// (e.g. "waecdirect", "de", "utme-mock").

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IVtuProviderAdapter,
  VtuPurchaseRequest,
  VtuPurchaseResult,
  VtuStatusResult,
  VtuProviderCredentials,
  VtuDeliveredData,
} from "@/src/services/providers/vtu/types"

const NETWORK_CODE: Record<string, string> = {
  mtn: "01",
  glo: "02",
  "9mobile": "03",
  etisalat: "03",
  airtel: "04",
}

function networkCode(networkOrBiller: string): string | undefined {
  return NETWORK_CODE[networkOrBiller.toLowerCase()]
}

function buildUrl(baseUrl: string, path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function getJson(url: string): Promise<any> {
  const res = await fetchWithRetry(url, { method: "GET" }, { retries: 2, timeoutMs: 15_000, retryUnsafe: false })
  return res.json()
}

function isReceived(json: any): boolean {
  return json?.status === "ORDER_RECEIVED" || json?.statuscode === "100" || json?.statuscode === 100
}

function extractElectricityData(json: any): VtuDeliveredData | undefined {
  const token = json?.metertoken
  return token ? { token: String(token) } : undefined
}

export const clubkonnectAdapter: IVtuProviderAdapter = {
  key: "clubkonnect",
  label: "ClubKonnect",
  supportsServices: ["airtime", "data", "cable", "electricity", "betting", "exam_pin", "epin"],

  async purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult> {
    const baseUrl = credentials.baseUrl || process.env.CLUBKONNECT_BASE_URL || "https://www.nellobytesystems.com"
    const userId = credentials.userId || process.env.CLUBKONNECT_USERID
    const apiKey = credentials.apiKey || process.env.CLUBKONNECT_APIKEY
    if (!userId || !apiKey) return { success: false, message: "ClubKonnect UserID/APIKey not configured" }

    const requestId = req.internalReference.slice(0, 50)
    const auth = { UserID: userId, APIKey: apiKey }

    try {
      let url: string
      switch (req.serviceType) {
        case "airtime": {
          const network = networkCode(req.networkOrBiller)
          if (!network) return { success: false, message: `ClubKonnect: unknown network "${req.networkOrBiller}"` }
          url = buildUrl(baseUrl, "/APIAirtimeV1.asp", {
            ...auth,
            MobileNetwork: network,
            Amount: req.amountKobo / 100,
            MobileNumber: req.recipient,
            RequestID: requestId,
          })
          break
        }
        case "data": {
          const network = networkCode(req.networkOrBiller)
          if (!network) return { success: false, message: `ClubKonnect: unknown network "${req.networkOrBiller}"` }
          url = buildUrl(baseUrl, "/APIDatabundleV1.asp", {
            ...auth,
            MobileNetwork: network,
            DataPlan: req.planCode,
            MobileNumber: req.recipient,
            RequestID: requestId,
          })
          break
        }
        case "cable": {
          // ClubKonnect docs: "Tip: Use Verify Smartcard endpoint
          // before subscription to validate customer." A wrong
          // smartcard/IUC number would otherwise deliver — and charge
          // for — a subscription to the wrong account.
          const verifyUrl = buildUrl(baseUrl, "/APIVerifyCableTVV1.asp", {
            ...auth,
            CableTV: req.networkOrBiller.toLowerCase(),
            SmartCardNo: req.recipient,
          })
          const verifyJson = await getJson(verifyUrl)
          const customerName = verifyJson?.customer_name
          if (!customerName || String(customerName).toUpperCase().includes("INVALID")) {
            return {
              success: false,
              message: customerName ? String(customerName) : "ClubKonnect could not verify this smartcard/IUC number",
              raw: verifyJson,
            }
          }
          url = buildUrl(baseUrl, "/APICableTVV1.asp", {
            ...auth,
            CableTV: req.networkOrBiller.toLowerCase(),
            Package: req.planCode,
            SmartCardNo: req.recipient,
            PhoneNo: req.contactPhone || req.recipient,
            RequestID: requestId,
          })
          break
        }
        case "electricity": {
          // Same rationale as cable: verify the meter belongs to the
          // expected customer before debiting the wallet, per
          // ClubKonnect's docs ("Always call this before Buy
          // Electricity so you can confirm the meter belongs to the
          // intended customer" — the same guidance VTUGate's own docs
          // give, mirrored here for consistency).
          const meterTypeCode = req.meterType === "postpaid" ? "02" : "01"
          const verifyUrl = buildUrl(baseUrl, "/APIVerifyElectricityV1.asp", {
            ...auth,
            ElectricCompany: req.networkOrBiller,
            MeterNo: req.recipient,
            MeterType: meterTypeCode,
          })
          const verifyJson = await getJson(verifyUrl)
          const customerName = verifyJson?.customer_name
          if (!customerName || String(customerName).toUpperCase().includes("INVALID")) {
            return {
              success: false,
              message: customerName ? String(customerName) : "ClubKonnect could not verify this meter number",
              raw: verifyJson,
            }
          }
          url = buildUrl(baseUrl, "/APIElectricityV1.asp", {
            ...auth,
            ElectricCompany: req.networkOrBiller,
            MeterType: meterTypeCode,
            MeterNo: req.recipient,
            Amount: req.amountKobo / 100,
            PhoneNo: req.contactPhone || req.recipient,
            RequestID: requestId,
          })
          break
        }
        case "betting": {
          url = buildUrl(baseUrl, "/APIBettingV1.asp", {
            ...auth,
            BettingCompany: req.networkOrBiller,
            CustomerID: req.recipient,
            Amount: req.amountKobo / 100,
            RequestID: requestId,
          })
          break
        }
        case "exam_pin": {
          const endpoint = req.networkOrBiller.toUpperCase() === "JAMB" ? "/APIJAMBV1.asp" : "/APIWAECV1.asp"
          url = buildUrl(baseUrl, endpoint, {
            ...auth,
            ExamType: req.planCode,
            PhoneNo: req.recipient,
            RequestID: requestId,
          })
          break
        }
        case "epin": {
          const network = networkCode(req.networkOrBiller)
          if (!network) return { success: false, message: `ClubKonnect: unknown network "${req.networkOrBiller}"` }
          url = buildUrl(baseUrl, "/APIEPINV1.asp", {
            ...auth,
            MobileNetwork: network,
            Value: req.planCode,
            Quantity: req.quantity && req.quantity > 0 ? req.quantity : 1,
            RequestID: requestId,
          })
          break
        }
        default:
          return { success: false, message: `ClubKonnect does not support service type: ${req.serviceType}` }
      }

      const json = await getJson(url)
      if (!isReceived(json) && json?.statuscode !== "200" && json?.status !== "ORDER_COMPLETED") {
        return { success: false, message: json?.status ?? json?.remark ?? "ClubKonnect returned a failing status", raw: json }
      }

      let deliveredData: VtuDeliveredData | undefined
      if (req.serviceType === "electricity") deliveredData = extractElectricityData(json)
      if (req.serviceType === "exam_pin" && json?.carddetails) {
        deliveredData = { pins: [{ pin: String(json.carddetails), serialNumber: undefined }] }
      }
      if (req.serviceType === "epin" && Array.isArray(json?.TXN_EPIN)) {
        deliveredData = {
          pins: json.TXN_EPIN.map((e: any) => ({ pin: e.pin, serialNumber: e.sno })),
        }
      }

      return {
        success: true,
        providerReference: json?.orderid ? String(json.orderid) : requestId,
        message: json?.remark ?? json?.status ?? "Order received by ClubKonnect",
        deliveredData,
        raw: json,
      }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "ClubKonnect request failed" }
    }
  },

  async checkStatus(providerReference: string, credentials: VtuProviderCredentials): Promise<VtuStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.CLUBKONNECT_BASE_URL || "https://www.nellobytesystems.com"
    const userId = credentials.userId || process.env.CLUBKONNECT_USERID
    const apiKey = credentials.apiKey || process.env.CLUBKONNECT_APIKEY
    if (!userId || !apiKey) return { status: "failed", message: "ClubKonnect UserID/APIKey not configured" }

    try {
      const url = buildUrl(baseUrl, "/APIQueryV1.asp", { UserID: userId, APIKey: apiKey, OrderID: providerReference })
      const json = await getJson(url)
      const raw = json?.status as string | undefined
      const status =
        raw === "ORDER_COMPLETED" ? "success" : raw === "ORDER_CANCELLED" || raw === "ORDER_ERROR" ? "failed" : "pending"

      let deliveredData: VtuDeliveredData | undefined = extractElectricityData(json)
      if (Array.isArray(json?.TXN_EPIN)) {
        deliveredData = { pins: json.TXN_EPIN.map((e: any) => ({ pin: e.pin, serialNumber: e.sno })) }
      } else if (Array.isArray(json?.TXN_EPIN_DATABUNDLE)) {
        deliveredData = { pins: json.TXN_EPIN_DATABUNDLE.map((e: any) => ({ pin: e.pin, serialNumber: e.sno })) }
      } else if (json?.carddetails) {
        deliveredData = { pins: [{ pin: String(json.carddetails) }] }
      }

      return { status, message: json?.remark ?? json?.status ?? "", deliveredData, raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
