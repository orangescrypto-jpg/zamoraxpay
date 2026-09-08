// app/(admin)/admin/providers/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"

interface VtuProvider {
  providerKey: string
  label: string
  isEnabled: boolean
  priority: number
  supportsServices: string[]
  hasCredentials: boolean
  lastHealthStatus: string | null
}

interface PaymentProvider {
  providerKey: string
  label: string
  isEnabled: boolean
  priority: number
  hasCredentials: boolean
}

export default function AdminProvidersPage() {
  const [vtuProviders, setVtuProviders] = useState<VtuProvider[]>([])
  const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCreds, setEditingCreds] = useState<{ type: "vtu" | "payment"; key: string } | null>(null)
  const [credsInput, setCredsInput] = useState("{}")

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const [vtuRes, paymentRes] = await Promise.all([
      fetch("/api/admin/providers/vtu", { headers }),
      fetch("/api/admin/providers/payment", { headers }),
    ])
    const vtuData = await vtuRes.json()
    const paymentData = await paymentRes.json()
    setVtuProviders(vtuData.providers ?? [])
    setPaymentProviders(paymentData.providers ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleVtu(p: VtuProvider) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/providers/vtu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ providerKey: p.providerKey, isEnabled: !p.isEnabled }),
    })
    load()
  }

  async function togglePayment(p: PaymentProvider) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/providers/payment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ providerKey: p.providerKey, isEnabled: !p.isEnabled }),
    })
    load()
  }

  async function changePriority(type: "vtu" | "payment", providerKey: string, priority: number) {
    const headers = await getAuthHeader()
    const endpoint = type === "vtu" ? "/api/admin/providers/vtu" : "/api/admin/providers/payment"
    await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ providerKey, priority }),
    })
    load()
  }

  async function saveCredentials() {
    if (!editingCreds) return
    let parsed: Record<string, string>
    try {
      parsed = JSON.parse(credsInput)
    } catch {
      alert("Invalid JSON")
      return
    }

    const headers = await getAuthHeader()
    const endpoint = editingCreds.type === "vtu" ? "/api/admin/providers/vtu" : "/api/admin/providers/payment"
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ providerKey: editingCreds.key, credentials: parsed }),
    })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? "Failed to save credentials (super_admin role required)")
      return
    }

    setEditingCreds(null)
    load()
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Providers</h1>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          <h2 className="mb-3 font-heading font-semibold text-secondary">
            VTU Providers <span className="text-xs font-normal text-muted-foreground">(fallback order — lower number tried first)</span>
          </h2>
          <div className="mb-8 max-w-3xl space-y-2">
            {vtuProviders.map((p) => (
              <div key={p.providerKey} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary">{p.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Supports: {p.supportsServices.join(", ")} ·{" "}
                      {p.hasCredentials ? "Credentials set" : "No credentials configured"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={p.priority}
                      onChange={(e) => changePriority("vtu", p.providerKey, parseInt(e.target.value, 10) || 0)}
                      className="w-16 rounded-md border border-border px-2 py-1 text-center text-sm"
                    />
                    <button
                      onClick={() => {
                        setEditingCreds({ type: "vtu", key: p.providerKey })
                        setCredsInput('{\n  "apiKey": ""\n}')
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Set keys
                    </button>
                    <button
                      onClick={() => toggleVtu(p)}
                      className={cn("h-6 w-11 rounded-full transition-colors", p.isEnabled ? "bg-accent" : "bg-muted")}
                    >
                      <span
                        className={cn(
                          "block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform",
                          p.isEnabled ? "translate-x-5" : "",
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2 className="mb-3 font-heading font-semibold text-secondary">Payment Providers</h2>
          <div className="max-w-3xl space-y-2">
            {paymentProviders.map((p) => (
              <div key={p.providerKey} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary">{p.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.hasCredentials ? "Credentials set" : "No credentials configured"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={p.priority}
                      onChange={(e) => changePriority("payment", p.providerKey, parseInt(e.target.value, 10) || 0)}
                      className="w-16 rounded-md border border-border px-2 py-1 text-center text-sm"
                    />
                    <button
                      onClick={() => {
                        setEditingCreds({ type: "payment", key: p.providerKey })
                        setCredsInput('{\n  "secretKey": "",\n  "webhookSecret": ""\n}')
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Set keys
                    </button>
                    <button
                      onClick={() => togglePayment(p)}
                      className={cn("h-6 w-11 rounded-full transition-colors", p.isEnabled ? "bg-accent" : "bg-muted")}
                    >
                      <span
                        className={cn(
                          "block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform",
                          p.isEnabled ? "translate-x-5" : "",
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editingCreds && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5">
            <h3 className="mb-3 font-heading font-semibold">Set credentials — {editingCreds.key}</h3>
            <textarea
              value={credsInput}
              onChange={(e) => setCredsInput(e.target.value)}
              rows={8}
              className="mb-4 w-full rounded-md border border-border p-3 font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingCreds(null)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveCredentials}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
