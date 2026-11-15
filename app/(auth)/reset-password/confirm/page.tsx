// app/(auth)/reset-password/confirm/page.tsx
// The landing page for Supabase password-recovery links.
// /api/auth/reset-password sends the email with redirectTo this page;
// Supabase appends its recovery tokens as URL hash fragments. Without
// this page the recovery link 404'd — the backend flow existed but the
// last mile was never built (same audit finding as /forgot-password).
//
// Flow: detect hash tokens -> exchange for a session -> show the
// new-password form -> supabase.auth.updateUser({ password }) -> done.
// Also renders a hand-off state while the hash exchange is in flight
// and a clear invalid/expired-link state with a "send a new link" exit.
"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter"
import { Eye, EyeOff } from "lucide-react"

type Phase = "exchanging" | "ready" | "saving" | "done" | "invalid"

export default function ResetPasswordConfirmPage() {
  const [phase, setPhase] = useState<Phase>("exchanging")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // phaseRef lets the timeout check the live phase without re-running
  // the effect (and re-exchanging) on every render.
  const phaseRef = useRef<Phase>("exchanging")
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    // Recovery links arrive as #access_token=...&refresh_token=... (or
    // #error=... on failure). runInChunks-style polling isn't needed —
    // exchangeCodeForSession handles PKCE links; detectSessionInUrl
    // handles implicit links. We only need to know a session exists.
    let cancelled = false

    async function exchange() {
      try {
        const supabase = createClient()
        const hash = window.location.hash

        if (hash.includes("error=")) {
          if (!cancelled) setPhase("invalid")
          return
        }

        // PKCE flow: ?code=... in the query string
        const code = new URLSearchParams(window.location.search).get("code")
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (cancelled) return
          if (error) {
            setPhase("invalid")
            return
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession()
        if (cancelled) return
        // A recovery session may not be detected synchronously on the
        // implicit flow; onAuthStateChange covers SIGNED_IN arriving a
        // tick later without adding a polling loop.
        if (!sessionError && data.session) {
          setPhase("ready")
          return
        }

        const { data: listener } = supabase.auth.onAuthStateChange((event) => {
          if (!cancelled && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY")) {
            setPhase("ready")
          }
        })
        // Give the implicit-flow tokens a moment to be detected; if
        // nothing lands, the link is stale/expired.
        window.setTimeout(() => {
          if (!cancelled && phaseRef.current === "exchanging") setPhase("invalid")
        }, 4000)
        return () => {
          listener.subscription.unsubscribe()
        }
      } catch {
        if (!cancelled) setPhase("invalid")
      }
    }

    exchange()
    return () => {
      cancelled = true
    }
  }, [])


  const passwordLongEnough = password.length >= 8
  const passwordsMatch = password === confirmPassword && password.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!passwordLongEnough) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.")
      return
    }
    setPhase("saving")
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        setPhase("ready")
        return
      }
      // Sign out after resetting so the recovery session doesn't linger
      // on a shared device — the user should log in fresh.
      await supabase.auth.signOut()
      setPhase("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password")
      setPhase("ready")
    }
  }

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        {phase === "exchanging" && (
          <div className="text-center" aria-busy="true" aria-label="Verifying reset link">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
          </div>
        )}

        {phase === "invalid" && (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-sm font-semibold text-secondary dark:text-foreground">This link has expired</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Password-reset links expire after 60 minutes and can only be used once. Request a fresh one to continue.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground"
            >
              Send a new link
            </Link>
            <Link href="/login" className="mt-3 inline-block text-sm text-primary hover:underline">
              Back to login
            </Link>
          </div>
        )}

        {phase === "done" && (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary dark:text-foreground">Password updated</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your password has been changed and you&apos;ve been signed out everywhere. Log in with your new password.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground"
            >
              Log in
            </Link>
          </div>
        )}

        {(phase === "ready" || phase === "saving") && (
          <>
            <h1 className="mb-1 text-2xl font-heading font-bold text-secondary dark:text-foreground">Set a new password</h1>
            <p className="mb-6 text-sm text-muted-foreground">Choose a strong password you don&apos;t use anywhere else.</p>

            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={password.length > 0 && !passwordLongEnough}
                    aria-describedby="password-hint"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p id="password-hint" className={`mt-1 text-xs ${password.length > 0 && !passwordLongEnough ? "text-destructive" : "text-muted-foreground"}`}>
                  At least 8 characters. Mix letters and numbers for a stronger password.
                </p>
                {password.length > 0 && (
                  <div className="mt-2">
                    <PasswordStrengthMeter password={password} id="reset-password-strength" />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={phase === "saving" || !passwordLongEnough || !passwordsMatch}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {phase === "saving" ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
