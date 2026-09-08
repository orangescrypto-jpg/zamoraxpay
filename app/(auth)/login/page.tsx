// app/(auth)/login/page.tsx
"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { AuthService } from "@/src/services/auth"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setUnconfirmedEmail(null)
    setResendState("idle")
    setLoading(true)
    try {
      await AuthService.login(identifier, password)
      router.push(searchParams.get("redirect") || "/dashboard")
    } catch (err) {
      const authErr = err as Error & { requiresConfirmation?: boolean; email?: string }
      if (authErr.requiresConfirmation && authErr.email) {
        setUnconfirmedEmail(authErr.email)
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : "Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!unconfirmedEmail) return
    setResendState("sending")
    try {
      await AuthService.resendConfirmationEmail(unconfirmedEmail)
      setResendState("sent")
    } catch (err) {
      setResendState("idle")
      setError(err instanceof Error ? err.message : "Failed to resend confirmation email")
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Welcome back</h1>
      <p className="mb-6 text-sm text-muted-foreground">Log in to your ZamoraxPay account.</p>

      {error && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {unconfirmedEmail && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Check your email. We sent a verification link to <strong>{unconfirmedEmail}</strong>. Click it before
            logging in.
          </p>
          {resendState === "sent" ? (
            <p className="mt-2 font-medium text-emerald-700">Confirmation email sent — check your inbox.</p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === "sending"}
              className="mt-2 font-medium text-primary underline disabled:opacity-50"
            >
              {resendState === "sending" ? "Sending…" : "Resend confirmation email"}
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Phone or email</label>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Password</label>
          <div className="relative">
            <input
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 pr-10 text-sm"
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
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="text-primary hover:underline">
          Create account
        </Link>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
