// src/services/providers/payment/types.ts
// Neutral contract every payment adapter (Korapay, Paystack, or any
// future gateway) implements. Same pattern as the VTU provider layer.

export interface PaymentInitRequest {
  amountKobo: number
  email: string
  reference: string
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export interface PaymentInitResult {
  success: boolean
  authorizationUrl?: string // where to redirect the user to pay
  providerReference?: string
  message: string
  raw?: unknown
}

export interface PaymentVerifyResult {
  success: boolean
  status: "success" | "pending" | "failed"
  amountKobo?: number
  providerReference?: string
  message: string
  raw?: unknown
}

export interface TransferRequest {
  amountKobo: number
  accountNumber: string
  bankCode: string
  accountName?: string
  reference: string
  reason?: string
}

export interface TransferResult {
  success: boolean
  providerTransferReference?: string
  status: "success" | "pending" | "failed"
  message: string
  raw?: unknown
}

export interface PaymentProviderCredentials {
  [key: string]: string | undefined
}

export interface IPaymentProviderAdapter {
  readonly key: string
  readonly label: string

  initialize(req: PaymentInitRequest, credentials: PaymentProviderCredentials): Promise<PaymentInitResult>

  verify(reference: string, credentials: PaymentProviderCredentials): Promise<PaymentVerifyResult>

  /** Validates a webhook's signature against the raw request body. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string, credentials: PaymentProviderCredentials): boolean

  /**
   * Sends money OUT to a bank account — used for automated withdrawal
   * payout. Requires the provider's Transfer feature to be enabled on
   * the account (separate from Charges), with sufficient settlement
   * balance to fund transfers.
   */
  transfer(req: TransferRequest, credentials: PaymentProviderCredentials): Promise<TransferResult>
}
