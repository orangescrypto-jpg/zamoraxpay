// app/(dashboard)/services/exam-pin/page.tsx
"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

const EXAM_BODIES = ["WAEC", "NECO", "JAMB", "NABTEB"]

interface DeliveredPin {
  pin: string
  serialNumber?: string
}

interface DeliveredData {
  pins?: DeliveredPin[]
  deliveryNote?: string
}

export default function ExamPinPage() {
  const [examBody, setExamBody] = useState(EXAM_BODIES[0])
  const [quantity, setQuantity] = useState("1")
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

    const res = await fetch("/api/vtu/exam-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ examBody, quantity: parseInt(quantity, 10), transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) {
      setPin("")
      if (data.deliveredData) setDeliveredData(data.deliveredData)
    }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Buy Exam PIN</h1>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      {/* This is the actual thing the customer paid for — it must stay
          visible and copyable, not just flash in a toast. It's also
          saved with the order (delivered_data column), so it's still
          retrievable from history afterward if they navigate away. */}
      {deliveredData?.pins && deliveredData.pins.length > 0 && (
        <div className="mb-4 space-y-2 rounded-md border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-secondary">Your PIN{deliveredData.pins.length > 1 ? "s" : ""}</p>
          {deliveredData.pins.map((p, i) => (
            <div key={i} className="rounded-md bg-white p-3 font-mono text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="tracking-widest">{p.pin}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(p.pin)}
                  className="shrink-0 rounded border border-border px-2 py-1 text-xs font-sans text-secondary hover:bg-muted"
                >
                  Copy
                </button>
              </div>
              {p.serialNumber && (
                <p className="mt-1 text-xs font-sans text-secondary/70">Serial: {p.serialNumber}</p>
              )}
            </div>
          ))}
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
          <label className="mb-1 block text-sm font-medium text-secondary">Exam body</label>
          <div className="grid grid-cols-4 gap-2">
            {EXAM_BODIES.map((b) => (
              <button type="button" key={b} onClick={() => setExamBody(b)}
                className={`rounded-md border py-2 text-sm font-medium ${examBody === b ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Quantity</label>
          <input required type="number" min={1} max={10} value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
          <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Buy PIN"}
        </button>
      </form>
    </div>
  )
}
