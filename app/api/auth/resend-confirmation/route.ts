// app/api/auth/resend-confirmation/route.ts
// Re-sends Supabase's signup confirmation email for a user who didn't
// receive (or lost) the original one. Only meaningful when the
// project's "Confirm email" setting is ON — if it's off, there was
// never a confirmation link to resend in the first place.

import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const supabase = createServiceRoleClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
      },
    })

    if (error) {
      // Don't leak whether the email exists or is already confirmed —
      // same privacy stance as reset-password. Supabase's own rate
      // limit error is the one case worth surfacing distinctly.
      if (error.message?.toLowerCase().includes("rate limit")) {
        return NextResponse.json(
          { error: "Please wait a moment before requesting another email." },
          { status: 429 },
        )
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to resend" }, { status: 500 })
  }
}
