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
import { awardSignupBonus } from "@/src/services/signupBonus"

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

    // Check email uniqueness before creating the Supabase auth user, for
    // the same reason as the phone check below — avoids depending on
    // Supabase's own duplicate-email error shape/wording downstream.
    const existingEmail = await d1Query("SELECT id FROM users WHERE email = ?", [email])
    if (existingEmail.results?.length) {
      return NextResponse.json({ error: "This email is already registered. Try logging in instead." }, { status: 409 })
    }

    // Check phone uniqueness before creating the Supabase auth user, so
    // we don't end up with an orphaned auth user when this fails.
    const existingPhone = await d1Query("SELECT id FROM users WHERE phone = ?", [phone])
    if (existingPhone.results?.length) {
      return NextResponse.json({ error: "This phone number is already registered. Try logging in instead." }, { status: 409 })
    }

    // email_confirm is left unset (defaults to Supabase's own project
    // setting) so the "Confirm email" toggle in the Supabase dashboard
    // is what actually governs whether this user can log in
    // immediately or must click a confirmation link first.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
    })

    if (authError || !authData.user) {
      const isDuplicateEmail =
        authError?.message?.toLowerCase().includes("already registered") ||
        authError?.message?.toLowerCase().includes("already exists") ||
        authError?.status === 422

      const message = isDuplicateEmail
        ? "This email is already registered. Try logging in instead."
        : authError?.message ?? "Signup failed"

      return NextResponse.json({ error: message }, { status: isDuplicateEmail ? 409 : 400 })
    }

    const uid = authData.user.id
    const referralCode = generateReferralCode()

    let referredByUserId: string | null = null
    if (referredByCode) {
      const referrer = await d1Query("SELECT id FROM users WHERE referral_code = ?", [referredByCode])
      referredByUserId = referrer.results?.[0]?.id ?? null
    }

    try {
      await d1Query(
        `INSERT INTO users (id, phone, email, full_name, tier, status, referral_code, referred_by_user_id)
         VALUES (?, ?, ?, ?, 'retail', 'active', ?, ?)`,
        [uid, phone, email, fullName, referralCode, referredByUserId],
      )

      await d1Query("INSERT INTO wallets (id, user_id, balance_kobo) VALUES (?, ?, 0)", [randomUUID(), uid])

      // Best-effort — a signup bonus hiccup should never fail the whole
      // signup (the account and wallet are already valid at this point).
      // creditWallet is idempotent on its own reference, so this is also
      // safe to leave as fire-and-forget without risking a double credit
      // if something upstream ever retries this whole request.
      await awardSignupBonus(uid).catch((err: unknown) =>
        console.error("[signup] Signup bonus award failed:", err),
      )

      if (referredByUserId) {
        await d1Query(
          "INSERT INTO referrals (id, referrer_user_id, referred_user_id, bonus_awarded, bonus_kobo) VALUES (?, ?, ?, 0, 0)",
          [randomUUID(), referredByUserId, uid],
        )
      }
    } catch (dbErr) {
      // Roll back the Supabase auth user so a failed D1 write doesn't
      // leave an orphaned account blocking this email from ever
      // signing up successfully.
      await supabase.auth.admin.deleteUser(uid).catch((cleanupErr: unknown) =>
        console.error("[signup] Failed to roll back orphaned auth user:", cleanupErr),
      )

      const message = dbErr instanceof Error && dbErr.message.includes("UNIQUE constraint failed: users.phone")
        ? "This phone number is already registered. Try logging in instead."
        : "Signup failed. Please try again."
      return NextResponse.json({ error: message }, { status: 409 })
    }

    // Fire-and-forget — a slow/failed welcome email should never block
    // the signup response. This is separate from Supabase's own
    // confirmation email (if that project setting is on); this one is
    // just a friendly product welcome note.
    sendWelcomeEmail(email, fullName).catch((err: unknown) => console.error("[signup] Welcome email failed:", err))

    // IMPORTANT: supabase.auth.admin.createUser() never sends a
    // confirmation email itself, no matter what the project's "Confirm
    // email" setting is — Supabase's own docs say so explicitly (the
    // admin API is meant for backend-created accounts; use
    // inviteUserByEmail() or resend() to actually trigger mail). Since
    // this route uses createUser(), we have to trigger the send
    // ourselves here, the same way the "Resend confirmation" button
    // does — otherwise the very first confirmation email a user is
    // supposed to get on signup never goes out, and the account only
    // becomes reachable once they notice and click Resend.
    if (!authData.user.email_confirmed_at) {
      await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login` },
      }).catch((err: unknown) => console.error("[signup] Confirmation email send failed:", err))
    }

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
    console.error("[signup] Unexpected error:", err)
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 })
  }
}
