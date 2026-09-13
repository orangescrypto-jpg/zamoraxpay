// src/services/providers/international/types.ts
// The neutral contract every international top-up adapter must
// implement — same architecture as src/services/providers/vtu/types.ts.
//
// Only VTUGate implements this today (ConnectBridge's docs don't
// expose an international top-up product), but the contract, registry,
// and router are written exactly like every other VTU service so a
// second provider can be added later with zero changes to checkout
// code, the router, or the admin panel: write an adapter file, add it
// to registry.ts, and add "international_topup" to that provider's
// supports_services in vtu_provider_configs.

export interface IntlCountry {
  isoName: string
  name: string
  continent?: string
  currencyCode: string
  currencyName?: string
  currencySymbol?: string
  flag?: string
  callingCodes?: string[]
}

export interface IntlOperator {
  operatorId: number
  name: string
  bundle: boolean
  data: boolean
  pin: boolean
  denominationType: "FIXED" | "RANGE"
  destinationCurrencyCode: string
  minAmount?: number | null
  maxAmount?: number | null
  fixedAmounts?: number[]
  countryIsoName?: string
  countryName?: string
}

export interface IntlFxPreview {
  operatorId: number
  operatorName: string
  amount: number // recipient's local currency amount
  currencyCode: string
  chargedToUserKobo: number // provider's own NGN quote, in kobo, before our markup
}

export interface IntlTopupRequest {
  operatorId?: number // omit for the fast airtime path — the adapter auto-detects from recipientNumber + countryCode
  amount: number // recipient's local currency amount
  countryCode: string
  recipientNumber: string
  internalReference: string // our idempotency key, for adapters that support passing a custom identifier through
}

export interface IntlTopupResult {
  success: boolean
  message: string
  providerTransactionId?: string // our-side reference from the provider's response (e.g. VTUGate's transaction_id)
  providerTransactionId2?: string // provider's own upstream id, for support lookups (e.g. Reloadly's transaction id)
  operatorId?: number
  operatorName?: string
  deliveredAmount?: number
  deliveredAmountCurrency?: string
  chargedToUserKobo?: number // authoritative NGN amount the provider actually charged — always re-read from here, never trust the earlier FX preview for the final debit
  raw?: unknown
}

export interface IntlTopupStatusResult {
  status: "pending" | "success" | "failed" | "processing" | "refunded"
  message: string
  raw?: unknown
}

export interface IntlProviderCredentials {
  [key: string]: string | undefined
}

export interface IInternationalTopupAdapter {
  readonly key: string
  readonly label: string

  fetchCountries(credentials: IntlProviderCredentials): Promise<IntlCountry[]>

  fetchOperators(
    countryCode: string,
    type: "data" | undefined,
    credentials: IntlProviderCredentials,
  ): Promise<IntlOperator[]>

  detectOperator(
    phoneNumber: string,
    countryCode: string,
    credentials: IntlProviderCredentials,
  ): Promise<IntlOperator | null>

  previewFxRate(
    operatorId: number,
    amount: number,
    credentials: IntlProviderCredentials,
  ): Promise<IntlFxPreview>

  purchase(req: IntlTopupRequest, credentials: IntlProviderCredentials): Promise<IntlTopupResult>

  checkStatus(providerTransactionId: string, credentials: IntlProviderCredentials): Promise<IntlTopupStatusResult>
}
