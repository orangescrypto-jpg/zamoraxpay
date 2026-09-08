// src/services/providers/supabase/server.ts
// Server-side Supabase client using @supabase/ssr.
// Use this in Server Components, API routes, and middleware.
//
// Points at ZamoraxPay's OWN Supabase project — never Zamorax
// Marketplace's. See client.ts for the reasoning.

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — middleware handles refresh
          }
        },
      },
    },
  )
}

/**
 * Server-side client using the service role key — bypasses RLS.
 * ONLY use this for trusted server-side operations (admin actions,
 * webhook handlers crediting wallets, etc.). Never expose this client
 * or the service role key to the browser.
 */
export function createServiceRoleClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js")
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
