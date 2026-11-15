// app/(auth)/signup/page.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { AuthService } from "@/src/services/auth"
import { normalizeNgPhone } from "@/lib/phoneNormalize"
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter"

// Password strength scoring now lives in the shared
// PasswordStrengthMeter component (components/ui/password-strength-meter.tsx)
// so signup and password-reset render the identical meter.

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmationNotice, setConfirmationNotice] = useState(false)

  // UX FIX (audit: signup weaknesses) — inline, live validation so
  // errors surface while typing instead of only after a submit:
  // normalized phone, email shape, password strength meter, match
  // check, and a terms checkbox.
  const normalizedPhone = useMemo(() => normalizeNgPhone(phone), [phone])
  const phoneValid = normalizedPhone.length === 11
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const passwordsMatch = password.length > 0 && password === confirmPassword

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Prefer the normalized phone: "+234 801 234 5678" and
    // "2348012345678" submit as "08012345678", same as the purchase
    // forms' normalizeNgPhone — prevents "phone already registered"
    // surprises from format-only differences.
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (!phoneValid) {
      setError("Enter a valid 11-digit Nigerian phone number.")
      return
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.")
      return
    }

    setLoading(true)
    try {
      const { requiresEmailConfirmation } = await AuthService.register({
        email: email.trim().toLowerCase(),
        phone: normalizedPhone,
        password,
        fullName: fullName.trim(),
      })

      if (requiresEmailConfirmation) {
        // Supabase's "Confirm email" project setting is ON — the user
        // must click the link Supabase emailed them before they can log
        // in. There is nothing else for this app to do here.
        setConfirmationNotice(true)
      } else {
        router.push("/dashboard")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setLoading(false)
    }
  }

  if (confirmationNotice) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-2xl font-heading font-bold text-secondary dark:text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then
            come back and log in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-heading font-bold text-secondary dark:text-foreground">Create your account</h1>
        <p className="mb-6 text-sm text-muted-foreground">Takes less than a minute.</p>

        {error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="signup-name" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Full name</label>
            <input
              id="signup-name"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label htmlFor="signup-email" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Email</label>
            <input
              id="signup-email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={email.length > 0 && !emailValid}
              aria-describedby={email.length > 0 && !emailValid ? "signup-email-error" : undefined}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            {email.length > 0 && !emailValid && (
              <p id="signup-email-error" className="mt-1 text-xs text-destructive">Enter a valid email address.</p>
            )}
          </div>
          <div>
            <label htmlFor="signup-phone" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Phone number</label>
            <input
              id="signup-phone"
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(normalizeNgPhone(e.target.value))}
              placeholder="08012345678"
              aria-invalid={phone.length > 0 && !phoneValid}
              aria-describedby={phone.length > 0 && !phoneValid ? "signup-phone-error" : undefined}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            {phone.length > 0 && !phoneValid && (
              <p id="signup-phone-error" className="mt-1 text-xs text-destructive">
                Enter your 11-digit Nigerian number starting with 0.
              </p>
            )}
            {phone.length > 0 && phoneValid && normalizedPhone !== phone && (
              <p className="mt-1 text-xs text-muted-foreground">Saved as {normalizedPhone}.</p>
            )}
          </div>
          <div>
            <label htmlFor="signup-password" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Password</label>
            <div className="relative">
              <input
                id="signup-password"
                required
                type={showPassword ? "text" : "password"}
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="signup-password-strength"
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
            {password.length > 0 && (
              <div className="mt-2">
                <PasswordStrengthMeter password={password} id="signup-password-strength" />
              </div>
            )}
          </div>
          <div>
            <label htmlFor="signup-confirm-password" className="mb-1 block text-sm font-medium text-secondary dark:text-foreground">Confirm password</label>
            <div className="relative">
              <input
                id="signup-confirm-password"
                required
                type={showConfirmPassword ? "text" : "password"}
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>
          <div>
            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5"
                aria-required
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" className="font-medium text-primary underline underline-offset-2">Terms of Service</Link>{" "}
                and{" "}
                <Link href="/privacy-policy" className="font-medium text-primary underline underline-offset-2">Privacy Policy</Link>.
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !acceptedTerms}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
