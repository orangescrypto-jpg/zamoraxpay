// src/services/providers/supabase/client.ts
// Browser-side Supabase client using @supabase/ssr.
// Use this in Client Components only.
//
// IMPORTANT: This points at ZamoraxPay's OWN Supabase project
// (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in this
// app's env), which is entirely separate from Zamorax Marketplace's
// Supabase project. ZamoraxPay does not require the heavier
// verification flow Marketplace users go through — signup here is
// phone/email + password + OTP only.

import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
