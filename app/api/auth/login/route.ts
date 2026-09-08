// app/api/auth/login/route.ts
// Accepts phone OR email as `identifier` + password. If a phone number
// is given, we look up the real email on file for that user (phone is
// stored but never verified, so this is a convenience lookup, not a
// trust boundary — the password check is what actually authenticates).

import { NextRequest, NextResponse } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { d1Query } from "@/lib/db/index"

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json()
    if (!identifier || !password) {
      return NextResponse.json({ error: "Identifier and password are required" }, { status: 400 })
    }

    let email = identifier
    const isPhone = /^\+?\d{7,15}$/.test(identifier.replace(/\s/g, ""))

    if (isPhone) {
      const result = await d1Query("SELECT email FROM users WHERE phone = ?", [identifier])
      const row = result.results?.[0]
      if (!row?.email) {
        return NextResponse.json({ error: "No account found with that phone number" }, { status: 404 })
      }
      email = row.email
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      // Supabase returns a specific error when email confirmation is
      // required and hasn't happened yet — surface that distinctly so
      // the frontend can show "check your email" instead of a generic
      // wrong-password message.
      if (error?.message?.toLowerCase().includes("email not confirmed")) {
        return NextResponse.json(
          { error: "Please confirm your email before logging in.", requiresConfirmation: true, email },
          { status: 403 },
        )
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const statusResult = await d1Query("SELECT status FROM users WHERE id = ?", [data.user.id])
    const status = statusResult.results?.[0]?.status
    if (status === "suspended" || status === "frozen") {
      await supabase.auth.signOut()
      return NextResponse.json({ error: "Account is suspended. Contact support." }, { status: 403 })
    }

    return NextResponse.json({ user: { id: data.user.id } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Login failed" }, { status: 500 })
  }
}
