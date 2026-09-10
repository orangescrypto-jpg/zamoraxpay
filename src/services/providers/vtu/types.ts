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

export type ExamPinType = "registration" | "result_checker"

export interface VtuPurchaseRequest {
  serviceType: VtuServiceType
  networkOrBiller: string // e.g. 'MTN', 'DSTV', 'IKEDC', 'WAEC'
  recipient: string // phone / meter / smartcard / betting account ID
  planCode?: string // data bundle code / cable package code / exam_pin pin-type ("registration" | "result_checker") / epin denomination ("100" | "200" | "500")
  quantity?: number // exam_pin and epin only — number of PINs to purchase. A real field now; no longer smuggled via planCode/recipient.
  amountKobo: number // amount to send to the provider (base cost, not the retail price charged to user)
  internalReference: string // our own idempotent reference, passed through so we can reconcile
  meterType?: "prepaid" | "postpaid" // electricity only; defaults to "prepaid" in adapters if omitted
  recipientName?: string // optional display name some providers accept for cable/electricity/betting
}

/**
 * Data the provider hands back that the CUSTOMER needs to see or keep —
 * as opposed to `raw`, which is for our own audit/debugging and is
 * never shown to the user. exam_pin, epin, and electricity (token)
 * purchases populate this today; every field is optional because
 * providers vary in what they return, and some (see Pairgate) deliver
 * this asynchronously via webhook rather than in the purchase response
 * at all, in which case it's simply absent until a follow-up mechanism
 * (see checkStatus / a future webhook receiver) fills it in.
 */
export interface VtuDeliveredData {
  /** Exam PIN(s) or recharge-card ePIN(s) — a purchase can be for more than one (quantity). */
  pins?: { pin: string; serialNumber?: string }[]
  /** Electricity prepaid token, plus optional units/receipt metadata some discos return. */
  token?: string
  units?: string
  /** Free-text note for cases where delivery is confirmed-but-delayed, e.g. Pairgate's async flow. */
  deliveryNote?: string
}

export interface VtuPurchaseResult {
  success: boolean
  providerReference?: string
  message: string
  deliveredData?: VtuDeliveredData // customer-facing PIN/token data, when the provider returns it synchronously
  raw?: unknown // raw provider response, stored for audit/debugging
}

export interface VtuStatusResult {
  status: "pending" | "success" | "failed"
  message: string
  deliveredData?: VtuDeliveredData // populated once a requery/webhook confirms async delivery
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
