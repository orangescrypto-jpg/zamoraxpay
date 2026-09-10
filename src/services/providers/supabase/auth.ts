// src/services/providers/supabase/auth.ts
// Supabase implementation of IAuthService for ZamoraxPay.
//
// Deliberately lighter than Zamorax Marketplace's auth: email +
// password only. No NIN, no store fields, no seller/buyer role split.
// Email verification (if any) is entirely Supabase's own "Confirm
// email" project setting — there is no custom OTP step here. Phone is
// collected as a plain profile field, not verified.

import { createClient } from "@/src/services/providers/supabase/client"
import type { IAuthService } from "@/src/services/auth"
import type { User, RegisterData } from "@/src/types"

async function safeJson(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: text || `HTTP ${res.status} ${res.statusText}` }
  }
}

async function fetchUserProfile(uid: string): Promise<User | null> {
  const res = await fetch(`/api/db/users/${uid}`, { credentials: "include" })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await safeJson(res)
    throw new Error(`Failed to fetch user profile (HTTP ${res.status}): ${body.error ?? "Unknown"}`)
  }
  return safeJson(res)
}

export const AuthService: IAuthService = {
  async register(data: RegisterData) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        phone: data.phone,
        password: data.password,
        fullName: data.fullName,
        referredByCode: data.referredByCode,
      }),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Registration failed")

    return {
      user: json.user as User,
      requiresEmailConfirmation: !!json.requiresEmailConfirmation,
    }
  },

  async login(identifier: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    })
    const json = await safeJson(res)
    if (!res.ok) {
      if (json.requiresConfirmation) {
        const err = new Error(json.error ?? "Login failed") as Error & {
          requiresConfirmation?: boolean
          email?: string
        }
        err.requiresConfirmation = true
        err.email = json.email
        throw err
      }
      throw new Error(json.error ?? "Login failed")
    }

    const profile = await fetchUserProfile(json.user.id)
    if (!profile) throw new Error("Profile not found")
    return profile
  },

  async resendConfirmationEmail(email: string) {
    const res = await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Failed to resend confirmation email")
  },

  async signOut() {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" })
    const supabase = createClient()
    await supabase.auth.signOut()
  },

  async resetPassword(email: string) {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json.error ?? "Reset failed")
  },

  async setTransactionPin(pin: string) {
    const res = await fetch("/api/auth/transaction-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
    if (!res.ok) {
      const json = await safeJson(res)
      throw new Error(json.error ?? "Failed to set transaction PIN")
    }
  },

  async verifyTransactionPin(pin: string) {
    const res = await fetch("/api/auth/transaction-pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
    const json = await safeJson(res)
    return res.ok && json.valid === true
  },

  async updateProfile(uid: string, updates: Partial<{ fullName: string; email: string; phone: string }>) {
    const res = await fetch(`/api/db/users/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const body = await safeJson(res)
      throw new Error(`Update failed (HTTP ${res.status}): ${body.error ?? "Unknown"}`)
    }
  },

  onAuthStateChanged(callback: (user: User | null) => void) {
    const supabase = createClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, session: any) => {
      if (!session?.user) {
        callback(null)
        return
      }
      try {
        const profile = await fetchUserProfile(session.user.id)
        callback(profile)
      } catch {
        callback(null)
      }
    })

    return () => subscription.unsubscribe()
  },
}
