// components/ui/password-strength-meter.tsx
//
// Shared live password-strength meter. Extracted from the signup page
// (audit follow-up: the reset-password flow had none) so signup and
// password-reset show the exact same scoring, labels and hints — one
// fix propagates everywhere. Scoring is deliberately simple and
// explainable (length + character variety), mirroring what the meter
// displays — not a cryptographic score the UI can't justify.

"use client"

import { useMemo } from "react"

export function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; hint: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length === 0) return { score: 0, label: "", hint: "Use at least 8 characters." }
  if (score <= 1) return { score: 1, label: "Weak", hint: "Add length, mixed case, a number or symbol." }
  if (score === 2) return { score: 2, label: "Fair", hint: "A little more variety makes it stronger." }
  if (score === 3) return { score: 3, label: "Good", hint: "Solid. One more improvement for excellent." }
  return { score: 4, label: "Strong", hint: "Excellent password." }
}

const STRENGTH_BAR_COLORS = [
  "bg-muted",
  "bg-destructive/70",
  "bg-amber-500",
  "bg-yellow-400",
  "bg-accent",
]

export function PasswordStrengthMeter({ password, id = "password-strength" }: { password: string; id?: string }) {
  const strength = useMemo(() => scorePassword(password), [password])

  if (password.length === 0) return null

  return (
    <div id={id} aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1 overflow-hidden rounded-full" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-full flex-1 rounded-full transition-colors ${
                i < strength.score ? STRENGTH_BAR_COLORS[strength.score] : "bg-muted"
              }`}
            />
          ))}
        </div>
        <span className="w-14 text-right text-xs font-medium text-muted-foreground">{strength.label}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{strength.hint}</p>
    </div>
  )
}
