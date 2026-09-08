// app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

    const supabase = createServiceRoleClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/confirm`,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Always return success even if the email doesn't exist, to avoid
    // leaking which emails are registered.
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reset failed" }, { status: 500 })
  }
}
