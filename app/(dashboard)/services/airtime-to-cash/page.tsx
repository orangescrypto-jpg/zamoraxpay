// app/(dashboard)/services/airtime-to-cash/page.tsx
"use client"

// This page does NOT process a transaction. It exists purely to
// surface the discount rate and a contact (phone/email) that the
// admin controls via site_settings. The actual airtime-for-cash
// exchange happens off-platform between the user and that contact —
// nothing here touches the wallet ledger or a VTU provider.

import { useEffect, useState } from "react"
import { Phone, Mail, Info } from "lucide-react"

interface AirtimeToCashConfig {
  enabled: boolean
  discountPercent: number
  contactPhone: string
  contactEmail: string
}

export default function AirtimeToCashPage() {
  const [config, setConfig] = useState<AirtimeToCashConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/airtime-to-cash")
        const data = await res.json()
        if (!cancelled) setConfig(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="container max-w-md py-8 text-secondary/60">Loading…</div>
  }

  if (!config?.enabled) {
    return (
      <div className="container max-w-md py-8">
        <h1 className="mb-4 text-2xl font-heading font-bold text-secondary">Airtime to Cash</h1>
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-secondary/70">
          This service is currently unavailable. Please check back later.
        </div>
      </div>
    )
  }

  const hasContact = config.contactPhone || config.contactEmail

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-2 text-2xl font-heading font-bold text-secondary">Airtime to Cash</h1>
      <p className="mb-6 text-sm text-secondary/70">
        Convert unused airtime into cash. This is handled directly by our team, reach out using the
        details below to get started.
      </p>

      <div className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-secondary/70">You get</p>
        <p className="text-3xl font-heading font-bold text-primary">{config.discountPercent}%</p>
        <p className="text-xs text-secondary/60">of your airtime value, paid as cash</p>
      </div>

      {hasContact ? (
        <div className="space-y-3">
          {config.contactPhone && (
            <a
              href={`tel:${config.contactPhone}`}
              className="flex items-center gap-3 rounded-md border border-border p-4 hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Phone className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-secondary">Call or WhatsApp</p>
                <p className="text-sm text-secondary/70">{config.contactPhone}</p>
              </div>
            </a>
          )}

          {config.contactEmail && (
            <a
              href={`mailto:${config.contactEmail}`}
              className="flex items-center gap-3 rounded-md border border-border p-4 hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-secondary">Email</p>
                <p className="text-sm text-secondary/70">{config.contactEmail}</p>
              </div>
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-secondary/70">
          Contact details haven't been set up yet. Please check back later.
        </div>
      )}

      <div className="mt-6 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          This exchange happens directly with our team outside the app, we don't process it through
          your wallet. Only deal with the official contact shown above.
        </p>
      </div>
    </div>
  )
}
