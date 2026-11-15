// app/(auth)/forgot-password/page.tsx
// FIX (audit finding): the login page linked to /forgot-password but no
// such route existed — a locked-out user hit a 404 at the worst possible
// moment. This page wraps the EXISTING AuthService.resetPassword flow
// (POST /api/auth/reset-password), which emails a Supabase recovery link
// pointing at /reset-password/confirm (also added in this change set).
//
// UX notes:
//  - always shows the same "check your inbox" confirmation whether or
//    not the address is registered (the API already avoids leaking
//    registered emails; the UI mirrors that)
//  - inline email validation + disabled state while sending
//  - "use a different email" resets the form so a typo doesn't dead-end
"use client"

import { useState } from "react"
import Link from "next/link"
import { AuthService } from "@/src/services/auth"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailValid) return
    setError(null)
    setLoading(true)
    try {
      await AuthService.resetPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-heading font-bold text-secondary dark:text-foreground">Reset your password</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Enter the email on your ZamoraxPay account and we&apos;ll send you a secure link to set a new password.
        </p>

        {sent ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary dark:text-foreground">Check your inbox</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If an account exists for <strong>{email.trim()}</strong>, a password-reset link is on its way. The link
              expires in 60 minutes.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Can&apos;t find it? Check your spam folder, or try another email address.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setSent(false); setEmail("") }}
                className="w-full rounded-md border border-border py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground"
              >
                Use a different email
              </button>
              <Link
                href="/login"
                className="w-full rounded-md bg-primary py-2.5 text-center text-sm font-medium text-primary-foreground"
              >
                Back to login
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">
                  Email address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={email.length > 0 && !emailValid}
                  aria-describedby={email.length > 0 && !emailValid ? "forgot-email-error" : undefined}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder="you@example.com"
                />
                {email.length > 0 && !emailValid && (
                  <p id="forgot-email-error" className="mt-1 text-xs text-destructive">
                    Enter a valid email address.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !emailValid}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <div className="mt-4 text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">
                ← Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
