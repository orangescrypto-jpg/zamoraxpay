// app/(admin)/admin/feature-flags/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import type { FeatureFlag } from "@/src/types"

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/feature-flags", { headers })
    const data = await res.json()
    setFlags(data.flags ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggle(flag: FeatureFlag) {
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, isEnabled: !f.isEnabled } : f)))
    const headers = await getAuthHeader()
    await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ key: flag.key, isEnabled: !flag.isEnabled }),
    })
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Feature Flags</h1>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="max-w-2xl space-y-2">
          {flags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
              <div>
                <p className="text-sm font-medium text-secondary">{flag.label}</p>
                {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
              </div>
              <button
                onClick={() => toggle(flag)}
                className={`h-6 w-11 rounded-full transition-colors ${flag.isEnabled ? "bg-accent" : "bg-muted"}`}
              >
                <span
                  className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
                    flag.isEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
