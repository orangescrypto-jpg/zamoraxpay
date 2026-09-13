// src/services/providers/international/vtugate.ts
// VTUGate international top-up adapter — implements IInternationalTopupAdapter.
//
// Verified against live docs: https://documenter.getpostman.com/view/47597134/2sB3BHkoUd
// Base: https://api.vtugate.com/api/v1/international
// Auth: Authorization: Bearer <API key> — same credential as the regular
// VTU adapter (getVtuProviderCredentials("vtugate", ...) is reused as-is;
// this is one account, two product surfaces).
// Bodies: application/x-www-form-urlencoded, same as vtugate.ts.
//
// Endpoints used:
//   /international/countries        empty POST -> Country[]
//   /international/operators        { country_code, type? } -> Operator[]
//   /international/detectoperator   { phone_number, country_code } -> Operator
//   /international/fxrate           { operator_id, amount } -> NGN quote (wholesale, commission_amount always 0)
//   /international/topup            { operator_id?, amount, country_code, recipient_number } -> synchronous result
//   /international/topupstatus      { transaction_id } -> live Reloadly requery
//
// Pricing: this whole product is wholesale on VTUGate's side (real cost
// + their small fee, no commission) — our own markup is applied on top
// by internationalTopupService.ts, same pattern as the reseller-tier
// markup used elsewhere, just expressed as a flat admin-configured %
// instead of a pricing_rules row (see note in internationalTopupService.ts
// on why pricing_rules' network/biller shape doesn't fit this service).
//
// Detect Operator can genuinely fail (unrecognized/ported numbers,
// upstream MNP lookup errors) — this adapter returns null rather than
// throwing, so the caller can fall back to fetchOperators() and let the
// user pick their network manually instead of a dead end.

import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IInternationalTopupAdapter,
  IntlCountry,
  IntlOperator,
  IntlFxPreview,
  IntlTopupRequest,
  IntlTopupResult,
  IntlTopupStatusResult,
  IntlProviderCredentials,
} from "@/src/services/providers/international/types"

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

function mapOperator(o: any): IntlOperator {
  return {
    operatorId: o.operatorId ?? o.id,
    name: o.name,
    bundle: !!o.bundle,
    data: !!o.data,
    pin: !!o.pin,
    denominationType: o.denominationType === "RANGE" ? "RANGE" : "FIXED",
    destinationCurrencyCode: o.destinationCurrencyCode,
    minAmount: o.minAmount ?? null,
    maxAmount: o.maxAmount ?? null,
    fixedAmounts: o.fixedAmounts ?? undefined,
    countryIsoName: o.country?.isoName,
    countryName: o.country?.name,
  }
}

export const vtugateInternationalAdapter: IInternationalTopupAdapter = {
  key: "vtugate",
  label: "VTUGate",

  async fetchCountries(credentials: IntlProviderCredentials): Promise<IntlCountry[]> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) throw new Error("VTUGate API key not configured")

    const json = await postForm(baseUrl, "/international/countries", apiKey, {})
    if (!json?.status) throw new Error(json?.message ?? "Failed to fetch countries")
    return (json.data ?? []).map((c: any) => ({
      isoName: c.isoName,
      name: c.name,
      continent: c.continent,
      currencyCode: c.currencyCode,
      currencyName: c.currencyName,
      currencySymbol: c.currencySymbol,
      flag: c.flag,
      callingCodes: c.callingCodes,
    }))
  },

  async fetchOperators(
    countryCode: string,
    type: "data" | undefined,
    credentials: IntlProviderCredentials,
  ): Promise<IntlOperator[]> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) throw new Error("VTUGate API key not configured")

    const json = await postForm(baseUrl, "/international/operators", apiKey, {
      country_code: countryCode,
      type,
    })
    if (!json?.status) throw new Error(json?.message ?? "Failed to fetch operators")
    return (json.data ?? []).map(mapOperator)
  },

  async detectOperator(
    phoneNumber: string,
    countryCode: string,
    credentials: IntlProviderCredentials,
  ): Promise<IntlOperator | null> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) throw new Error("VTUGate API key not configured")

    try {
      const json = await postForm(baseUrl, "/international/detectoperator", apiKey, {
        phone_number: phoneNumber,
        country_code: countryCode,
      })
      if (!json?.status || !json?.data) return null
      const d = json.data
      return {
        operatorId: d.operatorId ?? d.id,
        name: d.name,
        bundle: !!d.bundle,
        data: !!d.data,
        pin: !!d.pin,
        denominationType: d.denominationType === "RANGE" ? "RANGE" : "FIXED",
        destinationCurrencyCode: d.destinationCurrencyCode,
        minAmount: d.localMinAmount ?? null,
        maxAmount: d.localMaxAmount ?? null,
        fixedAmounts: d.localFixedAmounts ?? undefined,
        countryIsoName: d.country?.isoName,
        countryName: d.country?.name,
      }
    } catch {
      // Detection can genuinely fail (unrecognized/ported numbers, MNP
      // lookup errors) — null tells the caller to fall back to a manual
      // operator picker rather than treating this as a fatal error.
      return null
    }
  },

  async previewFxRate(
    operatorId: number,
    amount: number,
    credentials: IntlProviderCredentials,
  ): Promise<IntlFxPreview> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) throw new Error("VTUGate API key not configured")

    const json = await postForm(baseUrl, "/international/fxrate", apiKey, {
      operator_id: operatorId,
      amount,
    })
    if (!json?.status) throw new Error(json?.message ?? "Failed to fetch FX rate")
    const d = json.data
    return {
      operatorId: d.operator_id,
      operatorName: d.operator_name,
      amount: d.amount,
      currencyCode: d.currency_code,
      chargedToUserKobo: Math.round((d.charged_to_user ?? 0) * 100),
    }
  },

  async purchase(req: IntlTopupRequest, credentials: IntlProviderCredentials): Promise<IntlTopupResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) return { success: false, message: "VTUGate API key not configured" }

    try {
      const json = await postForm(baseUrl, "/international/topup", apiKey, {
        operator_id: req.operatorId,
        amount: req.amount,
        country_code: req.countryCode,
        recipient_number: req.recipientNumber,
      })
      const ok = json?.status === true && json?.data?.provider_status === true
      if (!ok) {
        return {
          success: false,
          message: json?.message ?? json?.data?.provider_message ?? "VTUGate returned a failing status",
          raw: json,
        }
      }
      const d = json.data
      return {
        success: true,
        message: json?.message ?? "International top-up was successful",
        providerTransactionId: d.transaction_id !== undefined ? String(d.transaction_id) : undefined,
        providerTransactionId2:
          d.reloadly_transaction_id !== undefined ? String(d.reloadly_transaction_id) : undefined,
        operatorId: d.operator_id,
        operatorName: d.operator_name,
        deliveredAmount: d.delivered_amount,
        deliveredAmountCurrency: d.delivered_amount_currency,
        chargedToUserKobo: Math.round((d.charged_to_user ?? 0) * 100),
        raw: json,
      }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "VTUGate request failed" }
    }
  },

  async checkStatus(
    providerTransactionId: string,
    credentials: IntlProviderCredentials,
  ): Promise<IntlTopupStatusResult> {
    const baseUrl = credentials.baseUrl || process.env.VTUGATE_BASE_URL || "https://api.vtugate.com/api/v1"
    const apiKey = credentials.apiKey || process.env.VTUGATE_API_KEY
    if (!apiKey) return { status: "failed", message: "VTUGate API key not configured" }

    try {
      const json = await postForm(baseUrl, "/international/topupstatus", apiKey, {
        transaction_id: providerTransactionId,
      })
      const raw = json?.data?.status as string | undefined
      const status =
        raw === "SUCCESSFUL"
          ? "success"
          : raw === "FAILED"
            ? "failed"
            : raw === "REFUNDED"
              ? "refunded"
              : raw === "PROCESSING"
                ? "processing"
                : "pending"
      return { status, message: json?.message ?? "", raw: json }
    } catch (err) {
      return { status: "failed", message: err instanceof Error ? err.message : "Status check failed" }
    }
  },
}
