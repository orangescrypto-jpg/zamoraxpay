// app/(dashboard)/services/electricity/page.tsx
"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

const BILLERS = ["IKEDC", "EKEDC", "AEDC", "PHEDC", "IBEDC", "KEDCO"]

interface DeliveredData {
  token?: string
  units?: string
  deliveryNote?: string
}

export default function ElectricityPage() {
  const [biller, setBiller] = useState(BILLERS[0])
  const [meterNumber, setMeterNumber] = useState("")
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid")
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deliveredData, setDeliveredData] = useState<DeliveredData | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setDeliveredData(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/electricity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        biller,
        meterNumber,
        meterType,
        amountKobo: Math.round(parseFloat(amount) * 100),
        transactionPin: pin,
      }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) {
      setMeterNumber(""); setAmount(""); setPin("")
      if (data.deliveredData) setDeliveredData(data.deliveredData)
    }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Pay Electricity</h1>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      {deliveredData?.token && (
        <div className="mb-4 space-y-2 rounded-md border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-secondary">Your prepaid token</p>
          <div className="rounded-md bg-white p-3 font-mono text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="tracking-widest">{deliveredData.token}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(deliveredData.token!)}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs font-sans text-secondary hover:bg-muted"
              >
                Copy
              </button>
            </div>
            {deliveredData.units && (
              <p className="mt-1 text-xs font-sans text-secondary/70">Units: {deliveredData.units}</p>
            )}
          </div>
          <p className="text-xs text-secondary/70">
            Save this now. You can also find it later in your order history.
          </p>
        </div>
      )}

      {deliveredData?.deliveryNote && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {deliveredData.deliveryNote}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Distribution company</label>
          <select value={biller} onChange={(e) => setBiller(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm">
            {BILLERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Meter type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["prepaid", "postpaid"] as const).map((t) => (
              <button type="button" key={t} onClick={() => setMeterType(t)}
                className={`rounded-md border py-2 text-sm font-medium capitalize ${meterType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Meter number</label>
          <input required value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Amount (₦)</label>
          <input required type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
          <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Pay bill"}
        </button>
      </form>
    </div>
  )
}
