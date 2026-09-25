// components/admin/spin/shared.tsx
// Types + small helpers shared by the Spin & Win admin panels.
"use client"

import type { ReactNode } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

export interface FieldDef {
  key: string
  label: string
  type: "number" | "kobo" | "text" | "int_list" | "kobo_list" | "weekdays"
  help?: string
}

export interface AdminPrize {
  id: string
  sourceKey: string
  label: string
  prizeType: string
  amountKobo: number
  discountPercent: number
  maxDiscountKobo: number
  discountServices: string | null
  discountMinPurchaseKobo: number
  voucherNetwork: string | null
  voucherPlanCode: string | null
  tokenCount: number
  rewardValidDays: number
  weight: number
  costKobo: number
  maxWinsPerDay: number
  maxWinsPerWeek: number
  isGuaranteePrize: boolean
  isJackpot: boolean
  color: string | null
  sortOrder: number
  isActive: boolean
  chancePercent: number
}

export interface AdminSource {
  sourceKey: string
  label: string
  description: string | null
  isEnabled: boolean
  startsAt: string | null
  endsAt: string | null
  ticketsPerAward: number
  spinsPerDay: number
  expiryMode: "end_of_day" | "hours"
  expiryHours: number
  dailyBudgetKobo: number
  guaranteeAfterLosses: number
  /** 'HH:MM' UTC clock time the free daily ticket resets (lazy sources only). Null = UTC midnight. */
  dailyResetTime: string | null
  config: Record<string, any>
  fieldDefs: FieldDef[]
  kind: "event" | "lazy" | "manual"
  prizes: AdminPrize[]
  expectedCostPerSpinKobo: number
  winChancePercent: number
  spentTodayKobo: number
  ticketsIssuedToday: number
}

export interface AdminSetting {
  key: string
  label: string
  description: string
  defaultValue: string
  type: "number" | "boolean"
  value: string
}

export interface TierBonus {
  tierKey: string
  sourceKey: string
  extraTickets: number
  weightBoostPercent: number
  isActive: boolean
}

export interface AdminOverview {
  enabled: boolean
  settings: AdminSetting[]
  sources: AdminSource[]
  tierBonuses: TierBonus[]
  prizeTypes: string[]
  networks: string[]
  defaultDiscountServices: string[]
}

export const PRIZE_TYPE_LABELS: Record<string, string> = {
  nothing: "No prize (better luck next time)",
  wallet_credit: "Wallet credit (spend-only)",
  discount: "Discount on next purchase",
  airtime_voucher: "Free airtime voucher",
  data_voucher: "Free data voucher",
  streak_protection: "Streak shield (free missed day)",
}

export async function adminHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }
}

/** Calls an admin spin endpoint. Throws an Error carrying the server's message. */
export async function adminApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(await adminHeaders()), ...(init.headers ?? {}) } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || json?.message || `Request failed (${res.status})`)
  return json as T
}

export const koboToNaira = (kobo: number) => (kobo ? String(kobo / 100) : "0")
export const nairaToKobo = (naira: string | number) => Math.round(Number(naira || 0) * 100)
export const fmt = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** 'YYYY-MM-DD HH:MM:SS' (UTC) → value for <input type="datetime-local"> */
export const toInputDate = (s: string | null) => (s ? s.replace(" ", "T").slice(0, 16) : "")

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {label && <span className="text-sm font-medium text-primary">{label}</span>}
    </label>
  )
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-primary">{label}</span>
      <div className="mt-1">{children}</div>
      {help && <span className="mt-1 block text-[11px] leading-snug text-secondary">{help}</span>}
    </label>
  )
}

export const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
export const btnPrimary = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
export const btnGhost = "rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-muted disabled:opacity-50"
export const btnDanger = "rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"

export function Notice({ notice }: { notice: { ok: boolean; text: string } | null }) {
  if (!notice) return null
  return (
    <p
      className={`fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md p-3 text-center text-sm shadow-lg ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
    >
      {notice.text}
    </p>
  )
}
