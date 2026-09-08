// src/services/providers/email/resend.ts
// Resend implementation of the email service.
// Other files should import from src/services/email.ts (the
// abstraction), not this file directly — see that file for why.

import { Resend } from "resend"

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("RESEND_API_KEY not configured")
  return new Resend(apiKey)
}

const FROM = process.env.RESEND_FROM_EMAIL || "ZamoraxPay <mail@mail.zamoraxpay.com.ng>"

export async function sendWelcomeEmail(to: string, fullName: string): Promise<void> {
  const resend = getClient()
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to ZamoraxPay 🎉",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#0057FF;">Welcome to ZamoraxPay, ${fullName}!</h2>
        <p>Your account is verified and ready to go. Fund your wallet to start buying airtime, data, cable, electricity, and more — instantly.</p>
        <p style="color:#666; font-size: 13px; margin-top: 32px;">If you didn't create this account, please contact support immediately.</p>
      </div>
    `,
  })
}

export async function sendWalletFundedEmail(to: string, amountNaira: number, newBalanceNaira: number): Promise<void> {
  const resend = getClient()
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Wallet funded: ₦${amountNaira.toLocaleString()}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#00D67A;">Wallet Funded ✅</h2>
        <p>Your ZamoraxPay wallet has been credited with <strong>₦${amountNaira.toLocaleString()}</strong>.</p>
        <p>New balance: <strong>₦${newBalanceNaira.toLocaleString()}</strong></p>
      </div>
    `,
  })
}

export async function sendPurchaseReceiptEmail(
  to: string,
  details: { serviceType: string; recipient: string; amountNaira: number; status: string },
): Promise<void> {
  const resend = getClient()
  const statusColor = details.status === "success" ? "#00D67A" : "#EF4444"
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${details.serviceType} purchase ${details.status}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:${statusColor}; text-transform: capitalize;">Purchase ${details.status}</h2>
        <table style="width:100%; font-size: 14px; color:#333;">
          <tr><td>Service</td><td style="text-align:right; text-transform: capitalize;">${details.serviceType}</td></tr>
          <tr><td>Recipient</td><td style="text-align:right;">${details.recipient}</td></tr>
          <tr><td>Amount</td><td style="text-align:right;">₦${details.amountNaira.toLocaleString()}</td></tr>
        </table>
      </div>
    `,
  })
}

export async function sendLowBalanceAlertEmail(to: string, balanceNaira: number): Promise<void> {
  const resend = getClient()
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your ZamoraxPay wallet balance is low",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#F59E0B;">Low Balance Alert</h2>
        <p>Your wallet balance is currently <strong>₦${balanceNaira.toLocaleString()}</strong>. Fund your wallet to avoid interruption to auto-reload or upcoming purchases.</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const resend = getClient()
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your ZamoraxPay password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#0057FF;">Reset Your Password</h2>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <p><a href="${resetLink}" style="background:#0057FF; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Reset Password</a></p>
        <p style="color:#666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })
}
