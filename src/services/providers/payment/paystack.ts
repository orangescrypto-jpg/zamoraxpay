// src/services/providers/payment/paystack.ts
// Paystack payment adapter — implements IPaymentProviderAdapter.
// Supports card, bank transfer, and virtual account funding (all
// channels enabled on the Paystack dashboard are presented on the
// hosted checkout page returned via authorization_url).

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

const PAYSTACK_BASE_URL = "https://api.paystack.co"

export const paystackAdapter: IPaymentProviderAdapter = {
  key: "paystack",
  label: "Paystack",

  async initialize(req: PaymentInitRequest, credentials: PaymentProviderCredentials): Promise<PaymentInitResult> {
    const secretKey = credentials.secretKey || process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) return { success: false, message: "Paystack secret key not configured" }

    try {
      const res = await fetchWithRetry(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            amount: req.amountKobo,
            email: req.email,
            reference: req.reference,
            callback_url: req.callbackUrl,
            metadata: req.metadata,
            channels: ["card", "bank_transfer", "bank"],
          }),
        },
        { retries: 2, timeoutMs: 15_000, retryUnsafe: false },
      )

      const json = (await res.json()) as any

      if (res.ok && json?.status === true) {
        return {
          success: true,
          authorizationUrl: json.data?.authorization_url,
          providerReference: json.data?.reference,
          message: "Paystack transaction initialized",
          raw: json,
        }
      }

      return { success: false, message: json?.message ?? "Paystack initialization failed", raw: json }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Paystack request failed" }
    }
  },

  async verify(reference: string, credentials: PaymentProviderCredentials): Promise<PaymentVerifyResult> {
    const secretKey = credentials.secretKey || process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) return { success: false, status: "failed", message: "Paystack secret key not configured" }

    try {
      const res = await fetchWithRetry(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        { method: "GET", headers: { Authorization: `Bearer ${secretKey}` } },
        { retries: 2, timeoutMs: 10_000 },
      )
      const json = (await res.json()) as any
      const providerStatus = json?.data?.status

      const status = providerStatus === "success" ? "success" : providerStatus === "abandoned" ? "pending" : "failed"

      return {
        success: status === "success",
        status,
        amountKobo: json?.data?.amount,
        providerReference: json?.data?.reference,
        message: json?.message ?? "",
        raw: json,
      }
    } catch (err) {
      return { success: false, status: "failed", message: err instanceof Error ? err.message : "Verification failed" }
    }
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string, credentials: PaymentProviderCredentials): boolean {
    const secretKey = credentials.secretKey || process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) return false

    const computed = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex")
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader))
    } catch {
      return false
    }
  },

  async transfer(req: TransferRequest, credentials: PaymentProviderCredentials): Promise<TransferResult> {
    const secretKey = credentials.secretKey || process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) return { success: false, status: "failed", message: "Paystack secret key not configured" }

    try {
      // Paystack requires a Transfer Recipient before a transfer can be
      // initiated. Created fresh each time rather than cached — the
      // recipient-creation call is cheap and this avoids needing a
      // separate table just to track recipient codes per bank account.
      const recipientRes = await fetchWithRetry(
        `${PAYSTACK_BASE_URL}/transferrecipient`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            type: "nuban",
            name: req.accountName ?? "ZamoraxPay user",
            account_number: req.accountNumber,
            bank_code: req.bankCode,
            currency: "NGN",
          }),
        },
        { retries: 1, timeoutMs: 15_000, retryUnsafe: false },
      )
      const recipientJson = (await recipientRes.json()) as any

      if (!recipientRes.ok || recipientJson?.status !== true) {
        return {
          success: false,
          status: "failed",
          message: recipientJson?.message ?? "Failed to create Paystack transfer recipient",
          raw: recipientJson,
        }
      }

      const recipientCode = recipientJson.data.recipient_code

      const transferRes = await fetchWithRetry(
        `${PAYSTACK_BASE_URL}/transfer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            source: "balance",
            amount: req.amountKobo,
            recipient: recipientCode,
            reference: req.reference,
            reason: req.reason ?? "ZamoraxPay withdrawal",
          }),
        },
        { retries: 1, timeoutMs: 20_000, retryUnsafe: false }, // never auto-retry a money-movement call
      )
      const transferJson = (await transferRes.json()) as any

      if (transferRes.ok && transferJson?.status === true) {
        const providerStatus = transferJson?.data?.status
        const status = providerStatus === "success" ? "success" : providerStatus === "pending" || providerStatus === "otp" ? "pending" : "failed"
        return {
          success: status !== "failed",
          status,
          providerTransferReference: transferJson?.data?.reference ?? req.reference,
          message: "Paystack transfer initiated",
          raw: transferJson,
        }
      }

      return { success: false, status: "failed", message: transferJson?.message ?? "Paystack transfer failed", raw: transferJson }
    } catch (err) {
      return { success: false, status: "failed", message: err instanceof Error ? err.message : "Paystack transfer request failed" }
    }
  },
}
