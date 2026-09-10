// src/types/index.ts
// Shared TypeScript types for ZamoraxPay.

export interface User {
  id: string
  phone: string | null
  email: string | null
  fullName: string | null
  emailConfirmed: boolean
  hasTransactionPin: boolean
  tier: "retail" | "reseller"
  status: "active" | "suspended" | "frozen"
  referralCode: string | null
  createdAt: string
  /** Null if this account has no admin_users row (i.e. an ordinary customer). */
  adminRole: "moderator" | "admin" | "super_admin" | null
}

export interface RegisterData {
  email: string
  phone: string
  password: string
  fullName: string
  referredByCode?: string
}

export interface Wallet {
  userId: string
  balanceKobo: number
  cashbackKobo: number
  lowBalanceAlertThresholdKobo: number
}

export type WalletTransactionType =
  | "funding"
  | "purchase"
  | "refund"
  | "cashback"
  | "referral_bonus"
  | "reseller_upgrade"
  | "admin_adjustment"
  | "signup_bonus"
  | "weekend_bonus"
  | "daily_streak"
  | "deposit_bonus"

export interface WalletTransaction {
  id: string
  userId: string
  type: WalletTransactionType
  direction: "credit" | "debit"
  amountKobo: number
  balanceAfterKobo: number
  reference: string
  providerReference: string | null
  status: "pending" | "completed" | "failed" | "reversed"
  createdAt: string
}

export type VtuServiceType =
  | "airtime"
  | "data"
  | "cable"
  | "electricity"
  | "exam_pin" // WAEC/NECO/NABTEB-style exam checker/registration PINs
  | "epin" // network recharge-card PINs (MTN/Glo/Airtel/9mobile) — distinct product from exam_pin
  | "betting"

export interface VtuOrder {
  id: string
  userId: string
  serviceType: VtuServiceType
  networkOrBiller: string
  recipient: string
  planCode: string | null
  amountKobo: number
  providerUsed: string | null
  status: "pending" | "success" | "failed" | "refunded"
  createdAt: string
}

export interface Beneficiary {
  id: string
  userId: string
  serviceType: VtuServiceType
  networkOrBiller: string
  recipient: string
  nickname: string | null
}

export interface FeatureFlag {
  key: string
  label: string
  description: string | null
  isEnabled: boolean
}

export type VtuProviderKey = "cheapdatahub" | "pairgate" | "vtpass" | "vtung"
export type PaymentProviderKey = "korapay" | "paystack"

export interface VtuProviderConfig {
  providerKey: VtuProviderKey
  label: string
  isEnabled: boolean
  priority: number
  supportsServices: VtuServiceType[]
  lastHealthStatus: "healthy" | "degraded" | "down" | "unknown" | null
}

export interface PaymentProviderConfig {
  providerKey: PaymentProviderKey
  label: string
  isEnabled: boolean
  priority: number
}

export interface Banner {
  id: string
  placement: "header_slider" | "footer"
  title: string | null
  imageUrl: string
  linkUrl: string | null
  sortOrder: number
  isActive: boolean
}

export interface SitePage {
  slug: string
  title: string
  contentMarkdown: string
  metaDescription: string | null
}
