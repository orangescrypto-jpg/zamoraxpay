// components/ui/data-balance-check.tsx
//
// Shown on data-purchase success screens. Nigerian users habitually dial a
// per-network USSD code right after buying data to confirm the bundle
// landed — we surface the correct code with a one-tap copy so they don't
// have to Google it. Deliberately tiny, dependency-free, and dark-mode safe.

"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

// Canonical data-balance USSD codes per network. MTN and Airtel accept both
// a short and a legacy form — we show the one currently advertised by the
// telcos.
const USSD_CODES: Record<string, string> = {
  MTN: "*461*4#",
  Airtel: "*140#",
  Glo: "*127*0#",
  "9mobile": "*228#",
}

export function DataBalanceCheck({ network }: { network: string }) {
  const [copied, setCopied] = useState(false)
  const code = USSD_CODES[network]

  // Unknown network (or a future one not in the map) — render nothing
  // rather than a dead "check your balance" block.
  if (!code) return null

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard can be blocked (insecure context, permission denied) —
      // the code is still visible to dial manually, so fail silently.
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-secondary dark:text-foreground">
          Check your {network} data balance
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Dial the code on the phone that received the bundle.
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-muted dark:text-foreground"
        aria-label={`Copy data balance code ${code}`}
      >
        <span className="font-mono tracking-wide">{code}</span>
        {copied ? (
          <Check size={13} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        ) : (
          <Copy size={13} aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
