// app/(dashboard)/services/cable/page.tsx
"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

const BILLERS = ["DSTV", "GOtv", "StarTimes"]
const PLANS: Record<string, { code: string; label: string }[]> = {
  DSTV: [
    { code: "DSTV_PADI", label: "DStv Padi" },
    { code: "DSTV_COMPACT", label: "DStv Compact" },
    { code: "DSTV_COMPACT_PLUS", label: "DStv Compact Plus" },
  ],
  GOtv: [
    { code: "GOTV_JOLLI", label: "GOtv Jolli" },
    { code: "GOTV_MAX", label: "GOtv Max" },
  ],
  StarTimes: [
    { code: "STARTIMES_BASIC", label: "StarTimes Basic" },
    { code: "STARTIMES_CLASSIC", label: "StarTimes Classic" },
  ],
}

export default function CablePage() {
  const [biller, setBiller] = useState(BILLERS[0])
  const [smartcardNumber, setSmartcardNumber] = useState("")
  const [planCode, setPlanCode] = useState(PLANS[BILLERS[0]][0].code)
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  function handleBillerChange(b: string) {
    setBiller(b)
    setPlanCode(PLANS[b][0].code)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/vtu/cable", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ biller, smartcardNumber, planCode, transactionPin: pin }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })
    if (data.success) { setSmartcardNumber(""); setPin("") }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Pay Cable TV</h1>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {BILLERS.map((b) => (
              <button type="button" key={b} onClick={() => handleBillerChange(b)}
                className={`rounded-md border py-2 text-sm font-medium ${biller === b ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"}`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Smartcard / IUC number</label>
          <input required value={smartcardNumber} onChange={(e) => setSmartcardNumber(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Package</label>
          <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm">
            {PLANS[biller].map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Transaction PIN</label>
          <input required type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-center tracking-widest" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Pay subscription"}
        </button>
      </form>
    </div>
  )
}
