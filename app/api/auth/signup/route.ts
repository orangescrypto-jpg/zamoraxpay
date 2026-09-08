// app/api/auth/signup/route.ts
// ZamoraxPay signup: creates the Supabase auth user, creates the
// matching D1 profile row, generates a referral code.
//
// Email verification is handled ENTIRELY by Supabase's own "Confirm
// email" setting (Authentication > Settings in the Supabase dashboard)
// — not by any code in this app. If that setting is ON, Supabase sends
// its own confirmation email and the user can't log in until they
// click it. If it's OFF, the account is usable immediately. Toggling
// it is a Supabase dashboard action, not a deploy.
//
// Phone number is collected as a plain profile field (useful as a
// contact number / for beneficiary defaults) but is NOT verified —
// there is no OTP step in this flow.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createServiceRoleClient } from "@/src/services/providers/supabase/server"
import { d1Query } from "@/lib/d1"
import { sendWelcomeEmail } from "@/src/services/email"

function generateReferralCode(): string {
  return "ZP" + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const { phone, email, password, fullName, referredByCode } = await req.json()

    if (!email || !phone || !password || !fullName) {
      return NextResponse.json({ error: "Email, phone, password, and full name are required" }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // email_confirm is left unset (defaults to Supabase's own project
    // setting) so the "Confirm email" toggle in the Supabase dashboard
    // is what actually governs whether this user can log in
    // immediately or must click a confirmation link first.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? "Signup failed" }, { status: 400 })
    }

    const uid = authData.user.id
    const referralCode = generateReferralCode()

    let referredByUserId: string | null = null
    if (referredByCode) {
      const referrer = await d1Query("SELECT id FROM users WHERE referral_code = ?", [referredByCode])
      referredByUserId = referrer.results?.[0]?.id ?? null
    }

    await d1Query(
      `INSERT INTO users (id, phone, email, full_name, tier, status, referral_code, referred_by_user_id)
       VALUES (?, ?, ?, ?, 'retail', 'active', ?, ?)`,
      [uid, phone, email, fullName, referralCode, referredByUserId],
    )

    await d1Query("INSERT INTO wallets (id, user_id, balance_kobo) VALUES (?, ?, 0)", [randomUUID(), uid])

    if (referredByUserId) {
      await d1Query(
        "INSERT INTO referrals (id, referrer_user_id, referred_user_id, bonus_awarded, bonus_kobo) VALUES (?, ?, ?, 0, 0)",
        [randomUUID(), referredByUserId, uid],
      )
    }

    // Fire-and-forget — a slow/failed welcome email should never block
    // the signup response. This is separate from Supabase's own
    // confirmation email (if that project setting is on); this one is
    // just a friendly product welcome note.
    sendWelcomeEmail(email, fullName).catch((err) => console.error("[signup] Welcome email failed:", err))

    return NextResponse.json({
      user: {
        id: uid,
        phone: phone ?? null,
        email,
        fullName,
        tier: "retail",
        status: "active",
        referralCode,
      },
      // Tells the frontend whether to show "check your email" messaging.
      // Supabase returns a null confirmed_at when email confirmation is
      // required; a non-null value means the project has email
      // confirmation OFF (or it auto-confirmed), and the user can log
      // in immediately.
      requiresEmailConfirmation: !authData.user.email_confirmed_at,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signup failed" },
      { status: 500 },
    )
  }
}
