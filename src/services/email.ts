// src/services/email.ts
// Service abstraction layer — email.
// Everything else imports from HERE, not from
// src/services/providers/email/resend.ts directly, so the email
// vendor can be swapped later without touching call sites.

export {
  sendWelcomeEmail,
  sendWalletFundedEmail,
  sendPurchaseReceiptEmail,
  sendLowBalanceAlertEmail,
  sendPasswordResetEmail,
} from "@/src/services/providers/email/resend"
