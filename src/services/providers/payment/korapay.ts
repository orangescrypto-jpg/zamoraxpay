// src/services/providers/payment/korapay.ts
// Korapay payment adapter — implements IPaymentProviderAdapter.
// Primary gateway for low-fee dynamic virtual bank account transfers,
// per the PRD. Field names follow Korapay's publicly documented
// Charge API shape; confirm against your live account once you have
// real credentials.

import crypto from "crypto"
import { fetchWithRetry } from "@/lib/fetch-with-retry"
import type {
  IPaymentProviderAdapter,
  PaymentInitRequest,
  PaymentInitResult,
  PaymentVerifyResult,
  PaymentProviderCredentials,
  TransferRequest,
  TransferResult,
} from "@/src/services/providers/payment/types"

const KORAPAY_BASE_URL = "https://api.korapay.com/merchant/api/v1"

export const korapayAdapter: IPaymentProviderAdapter = {
  key: "korapay",
  label: "Korapay",

  async initialize(req: PaymentInitRequest, credentials: PaymentProviderCredentials): Promise<PaymentInitResult> {
    const secretKey = credentials.secretKey || process.env.KORAPAY_SECRET_KEY
    if (!secretKey) return { success: false, message: "Korapay secret key not configured" }

    try {
      const res = await fetchWithRetry(
        `${KORAPAY_BASE_URL}/charges/initialize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            amount: req.amountKobo / 100,
            currency: "NGN",
            reference: req.reference,
            customer: { email: req.email },
            redirect_url: req.callbackUrl,
            metadata: req.metadata,
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any

      if (res.ok && json?.status === true) {
        return {
          success: true,
          authorizationUrl: json.data?.checkout_url,
          providerReference: json.data?.reference,
          message: "Korapay charge initialized",
          raw: json,
        }
      }

      return { success: false, message: json?.message ?? "Korapay initialization failed", raw: json }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Korapay request failed" }
    }
  },

  async verify(reference: string, credentials: PaymentProviderCredentials): Promise<PaymentVerifyResult> {
    const secretKey = credentials.secretKey || process.env.KORAPAY_SECRET_KEY
    if (!secretKey) return { success: false, status: "failed", message: "Korapay secret key not configured" }

    try {
      const res = await fetchWithRetry(
        `${KORAPAY_BASE_URL}/charges/${reference}`,
        { method: "GET", headers: { Authorization: `Bearer ${secretKey}` } },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const providerStatus = json?.data?.status

      const status = providerStatus === "success" ? "success" : providerStatus === "processing" ? "pending" : "failed"

      return {
        success: status === "success",
        status,
        amountKobo: json?.data?.amount ? Math.round(json.data.amount * 100) : undefined,
        providerReference: json?.data?.reference,
        message: json?.message ?? "",
        raw: json,
      }
    } catch (err) {
      return { success: false, status: "failed", message: err instanceof Error ? err.message : "Verification failed" }
    }
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string, credentials: PaymentProviderCredentials): boolean {
    const webhookSecret = credentials.webhookSecret || process.env.KORAPAY_WEBHOOK_SECRET
    if (!webhookSecret) return false

    const computed = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader))
    } catch {
      // Buffers of different length throw — treat as invalid signature.
      return false
    }
  },

  async transfer(req: TransferRequest, credentials: PaymentProviderCredentials): Promise<TransferResult> {
    const secretKey = credentials.secretKey || process.env.KORAPAY_SECRET_KEY
    if (!secretKey) return { success: false, status: "failed", message: "Korapay secret key not configured" }

    try {
      const res = await fetchWithRetry(
        `${KORAPAY_BASE_URL}/transactions/disburse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            reference: req.reference,
            destination: {
              type: "bank_account",
              amount: req.amountKobo / 100,
              currency: "NGN",
              narration: req.reason ?? "ZamoraxPay withdrawal",
              bank_account: {
                bank: req.bankCode,
                account: req.accountNumber,
              },
              customer: { name: req.accountName ?? "ZamoraxPay user" },
            },
          }),
        },
        { retries: 1, timeoutMs: 20_000, retryUnsafe: false }, // never auto-retry a money-movement call
      )

      const json = (await res.json()) as any

      if (res.ok && json?.status === true) {
        const providerStatus = json?.data?.status
        const status = providerStatus === "success" ? "success" : providerStatus === "processing" ? "pending" : "failed"
        return {
          success: status !== "failed",
          status,
          providerTransferReference: json?.data?.reference ?? req.reference,
          message: "Korapay transfer initiated",
          raw: json,
        }
      }

      return { success: false, status: "failed", message: json?.message ?? "Korapay transfer failed", raw: json }
    } catch (err) {
      return { success: false, status: "failed", message: err instanceof Error ? err.message : "Korapay transfer request failed" }
    }
  },
}
