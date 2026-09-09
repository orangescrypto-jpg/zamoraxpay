// app/(dashboard)/services/electricity/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"

const BILLERS = ["IKEDC", "EKEDC", "AEDC", "PHEDC", "IBEDC", "KEDCO"]
const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const

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

  // Recurring/scheduled payment options — lets a user set this bill up
  // to run automatically instead of paying manually every cycle, the
  // same way auto-reload already works for data plans.
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly")
  const [scheduleNote, setScheduleNote] = useState<{ success: boolean; message: string } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function scheduleRecurringPayment(amountKobo: number) {
    setScheduleNote(null)
    try {
      const headers = await getAuthHeader()

      // Auto-reload rules run against a saved beneficiary, so make sure
      // one exists for this biller + meter number before creating the rule.
      const beneficiaryRes = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          serviceType: "electricity",
          networkOrBiller: biller,
          recipient: meterNumber,
          nickname: `${biller} - ${meterNumber}`,
        }),
      })
      const beneficiaryData = await beneficiaryRes.json()
      if (!beneficiaryRes.ok || !beneficiaryData.id) {
        setScheduleNote({ success: false, message: beneficiaryData.error ?? "Could not save meter for scheduling" })
        return
      }

      const ruleRes = await fetch("/api/auto-reload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          beneficiaryId: beneficiaryData.id,
          serviceType: "electricity",
          planCode: meterType,
          amountKobo,
          frequency,
        }),
      })
      const ruleData = await ruleRes.json()
      if (!ruleRes.ok) {
        setScheduleNote({ success: false, message: ruleData.error ?? "Could not set up the schedule" })
        return
      }

      setScheduleNote({ success: true, message: `Scheduled — this bill will now run ${frequency}.` })
    } catch {
      setScheduleNote({ success: false, message: "Could not set up the schedule" })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setDeliveredData(null)
    setScheduleNote(null)
    setLoading(true)

    const amountKobo = Math.round(parseFloat(amount) * 100)
    const headers = await getAuthHeader()

    const res = await fetch("/api/vtu/electricity", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        biller,
        meterNumber,
        meterType,
        amountKobo,
        transactionPin: pin,
      }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })

    if (data.success) {
      if (data.deliveredData) setDeliveredData(data.deliveredData)
      if (makeRecurring) await scheduleRecurringPayment(amountKobo)
      setMeterNumber("")
      setAmount("")
      setPin("")
    }
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">Pay Electricity</h1>
        <Link href="/services/scheduled-bills" className="text-xs font-medium text-primary underline">
          Scheduled payments
        </Link>
      </div>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      {scheduleNote && (
        <p className={`mb-4 rounded-md p-3 text-sm ${scheduleNote.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {scheduleNote.message}
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

        <div className="rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-secondary">
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={(e) => setMakeRecurring(e.target.checked)}
              className="h-4 w-4"
            />
            Make this a recurring payment
          </label>

          {makeRecurring && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-secondary">How often</label>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCIES.map((f) => (
                  <button
                    type="button"
                    key={f.value}
                    onClick={() => setFrequency(f.value)}
                    className={`rounded-md border py-1.5 text-xs font-medium ${
                      frequency === f.value ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Every {frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month"}, this same
                amount will be paid to this meter automatically using your wallet balance. You can pause
                or cancel it anytime from Scheduled Payments.
              </p>
            </div>
          )}
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
