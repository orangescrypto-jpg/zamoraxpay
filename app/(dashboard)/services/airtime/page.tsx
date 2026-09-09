// app/(dashboard)/services/airtime/page.tsx
"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { detectNetwork, matchesSelectedNetwork, type NetworkName } from "@/lib/networkDetect"

const NETWORKS: NetworkName[] = ["MTN", "Airtel", "Glo", "9mobile"]

export default function AirtimePage() {
  const [network, setNetwork] = useState(NETWORKS[0])
  const [phone, setPhone] = useState("")
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const networkMismatch = phone.length > 0 && !matchesSelectedNetwork(phone, network)
  const detected = detectNetwork(phone)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    if (networkMismatch) {
      const proceed = window.confirm(
        `This number looks like it's on ${detected}, not ${network}. Buy anyway?`,
      )
      if (!proceed) return
    }

    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/airtime", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ network, phone, amountKobo: Math.round(parseFloat(amount) * 100), transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })

    if (data.success) {
      setPhone("")
      setAmount("")
      setPin("")
    }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Buy Airtime</h1>

      {result && (
        <p
          className={`mb-4 rounded-md p-3 text-sm ${
            result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Network</label>
          <div className="grid grid-cols-4 gap-2">
            {NETWORKS.map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setNetwork(n)}
                className={`rounded-md border py-2 text-sm font-medium ${
                  network === n ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Phone number</label>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08012345678"
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              networkMismatch ? "border-destructive" : "border-border"
            }`}
          />
          {networkMismatch && (
            <p className="mt-1 text-xs text-destructive">
              This looks like a {detected} number, but you selected {network}. Double-check before you pay.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Amount (₦)</label>
          <input
            required
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
          <input
            required
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : "Buy airtime"}
        </button>
      </form>
    </div>
  )
}
