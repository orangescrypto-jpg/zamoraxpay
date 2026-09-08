// src/services/providers/vtu/types.ts
// The neutral contract every VTU adapter must implement.
//
// This is the whole point of the "no hardcoding" architecture: checkout
// code, the router, and the admin panel only ever talk to THIS
// interface. A concrete provider (CheapDataHub, Pairgate, VTpass,
// VTU.ng, or any future one) is just a file that implements it and
// registers itself in registry.ts. Nothing else in the app needs to
// change to add, remove, or reorder a provider.

import type { VtuServiceType } from "@/src/types"

export interface VtuPurchaseRequest {
  serviceType: VtuServiceType
  networkOrBiller: string // e.g. 'MTN', 'DSTV', 'IKEDC', 'WAEC'
  recipient: string // phone / meter / smartcard / betting account ID
  planCode?: string // data bundle code / cable package code
  amountKobo: number // amount to send to the provider (base cost, not the retail price charged to user)
  internalReference: string // our own idempotent reference, passed through so we can reconcile
  meterType?: "prepaid" | "postpaid" // electricity only; defaults to "prepaid" in adapters if omitted
  recipientName?: string // optional display name some providers accept for cable/electricity/betting
}

export interface VtuPurchaseResult {
  success: boolean
  providerReference?: string
  message: string
  raw?: unknown // raw provider response, stored for audit/debugging
}

export interface VtuStatusResult {
  status: "pending" | "success" | "failed"
  message: string
  raw?: unknown
}

export interface VtuProviderCredentials {
  [key: string]: string | undefined
}

/**
 * Every VTU adapter implements this. Constructed with whatever
 * credentials the router resolved (D1 admin config, falling back to
 * env vars) — an adapter never reads process.env directly, so it stays
 * testable and swappable.
 */
export interface IVtuProviderAdapter {
  readonly key: string
  readonly label: string
  readonly supportsServices: VtuServiceType[]

  purchase(req: VtuPurchaseRequest, credentials: VtuProviderCredentials): Promise<VtuPurchaseResult>

  checkStatus(
    providerReference: string,
    credentials: VtuProviderCredentials,
  ): Promise<VtuStatusResult>
}
