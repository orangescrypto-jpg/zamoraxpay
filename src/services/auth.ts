// src/services/auth.ts
// Service abstraction layer — auth.
//
// Nothing outside this file (and its provider implementation) should
// ever call Supabase directly for auth. Routes, components, and hooks
// import `AuthService` from HERE, never from
// `src/services/providers/supabase/*` directly. This keeps auth
// swappable (e.g. if ZamoraxPay ever migrates providers) without
// touching a single UI file — the same discipline Zamorax Marketplace
// follows for its own service layer.

import type { User, RegisterData } from "@/src/types"

export interface IAuthService {
  /**
   * Creates the account. Email verification (if enabled) is handled
   * entirely by Supabase's own confirmation-email flow — this method
   * does not send or check any OTP. `requiresEmailConfirmation` tells
   * the caller whether Supabase is gating login behind a confirmation
   * link (project setting) or the account is immediately usable.
   */
  register(data: RegisterData): Promise<{ user: User; requiresEmailConfirmation: boolean }>

  login(identifier: string, password: string): Promise<User>

  signOut(): Promise<void>

  resetPassword(email: string): Promise<void>

  setTransactionPin(pin: string): Promise<void>

  verifyTransactionPin(pin: string): Promise<boolean>

  updateProfile(uid: string, updates: Partial<{ fullName: string; email: string }>): Promise<void>

  onAuthStateChanged(callback: (user: User | null) => void): () => void
}

// Provider selection point. Swapping the auth backend later means
// changing this one import — nothing else in the app changes.
import { AuthService as SupabaseAuthService } from "@/src/services/providers/supabase/auth"

export const AuthService: IAuthService = SupabaseAuthService
