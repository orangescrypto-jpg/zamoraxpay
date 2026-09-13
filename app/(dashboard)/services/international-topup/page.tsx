// app/(dashboard)/services/international-topup/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

interface Country {
  isoName: string
  name: string
  currencyCode: string
  flag?: string
  callingCodes?: string[]
}

interface Operator {
  operatorId: number
  name: string
  denominationType: "FIXED" | "RANGE"
  destinationCurrencyCode: string
  minAmount?: number | null
  maxAmount?: number | null
  fixedAmounts?: number[]
}

interface FxPreview {
  operatorId: number
  operatorName: string
  amount: number
  currencyCode: string
  chargedToUserKobo: number
}

async function authedFetch(path: string, opts: RequestInit = {}) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${session?.access_token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  })
}

export default function InternationalTopupPage() {
  const [countries, setCountries] = useState<Country[]>([])
  const [countryCode, setCountryCode] = useState("")
  const [phone, setPhone] = useState("")
  const [operators, setOperators] = useState<Operator[]>([])
  const [operator, setOperator] = useState<Operator | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [manualPick, setManualPick] = useState(false)
  const [amount, setAmount] = useState("")
  const [preview, setPreview] = useState<FxPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    authedFetch("/api/international-topup/countries")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setCountries(data.data)
        } else {
          setResult({ success: false, message: data.message ?? "Failed to load countries" })
        }
        setLoadingCountries(false)
      })
      .catch((err) => {
        setResult({ success: false, message: err instanceof Error ? err.message : "Failed to load countries" })
        setLoadingCountries(false)
      })
  }, [])

  const selectedCountry = countries.find((c) => c.isoName === countryCode)

  async function handleDetect() {
    if (!countryCode || !phone) return
    setDetecting(true)
    setOperator(null)
    setManualPick(false)
    setResult(null)

    const res = await authedFetch("/api/international-topup/detect-operator", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: phone, countryCode }),
    })
    const data = await res.json()
    setDetecting(false)

    if (data.success && data.data) {
      setOperator(data.data)
    } else {
      // Detection failed — fall back to a manual operator picker rather
      // than a dead end.
      setManualPick(true)
      const opRes = await authedFetch(`/api/international-topup/operators?country_code=${countryCode}`)
      const opData = await opRes.json()
      if (opData.success) setOperators(opData.data)
    }
  }

  async function handlePreview() {
    if (!operator || !amount) return
    setPreviewLoading(true)
    setPreview(null)
    setResult(null)

    const res = await authedFetch("/api/international-topup/preview", {
      method: "POST",
      body: JSON.stringify({ operatorId: operator.operatorId, amount: parseFloat(amount) }),
    })
    const data = await res.json()
    setPreviewLoading(false)
    if (data.success) setPreview(data.data)
    else setResult({ success: false, message: data.message })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!operator || !amount || !pin) return
    setLoading(true)
    setResult(null)

    const res = await authedFetch("/api/international-topup/purchase", {
      method: "POST",
      body: JSON.stringify({
        operatorId: operator.operatorId,
        amount: parseFloat(amount),
        countryCode,
        recipientNumber: phone,
        transactionPin: pin,
      }),
    })
    const data = await res.json()
    setLoading(false)
    setResult({ success: data.success, message: data.message ?? data.error })

    if (data.success) {
      setPhone("")
      setOperator(null)
      setAmount("")
      setPreview(null)
      setPin("")
    }
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">International Airtime &amp; Data</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Send airtime or a data bundle to a phone number in another country.
      </p>

      {result && (
        <p
          className={`mb-4 rounded-md p-3 text-sm ${
            result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.message}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Country</label>
          <select
            value={countryCode}
            onChange={(e) => {
              setCountryCode(e.target.value)
              setOperator(null)
              setManualPick(false)
              setPreview(null)
            }}
            disabled={loadingCountries}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="">{loadingCountries ? "Loading countries..." : "Select a country"}</option>
            {countries.map((c) => (
              <option key={c.isoName} value={c.isoName}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {countryCode && (
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Recipient phone number</label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setOperator(null)
                  setPreview(null)
                }}
                placeholder={selectedCountry?.callingCodes?.[0] ? `${selectedCountry.callingCodes[0]}...` : "Phone number"}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleDetect}
                disabled={!phone || detecting}
                className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary disabled:opacity-50"
              >
                {detecting ? "..." : "Detect"}
              </button>
            </div>
            {operator && (
              <p className="mt-1 text-xs text-accent">Detected: {operator.name}</p>
            )}
          </div>
        )}

        {manualPick && !operator && (
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">
              Couldn&apos;t detect the network — pick it manually
            </label>
            <select
              onChange={(e) => {
                const op = operators.find((o) => String(o.operatorId) === e.target.value)
                setOperator(op ?? null)
                setPreview(null)
              }}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">Select network</option>
              {operators.map((o) => (
                <option key={o.operatorId} value={o.operatorId}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {operator && (
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">
              Amount ({operator.destinationCurrencyCode})
            </label>
            {operator.denominationType === "FIXED" && operator.fixedAmounts?.length ? (
              <div className="grid grid-cols-3 gap-2">
                {operator.fixedAmounts.map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => {
                      setAmount(String(amt))
                      setPreview(null)
                    }}
                    className={`rounded-md border py-2 text-sm font-medium ${
                      amount === String(amt) ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"
                    }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="number"
                min={operator.minAmount ?? undefined}
                max={operator.maxAmount ?? undefined}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setPreview(null)
                }}
                placeholder={
                  operator.minAmount != null && operator.maxAmount != null
                    ? `${operator.minAmount} - ${operator.maxAmount}`
                    : "Amount"
                }
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            )}

            {amount && (
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading}
                className="mt-2 text-xs font-medium text-primary underline disabled:opacity-50"
              >
                {previewLoading ? "Checking rate..." : "Preview NGN charge"}
              </button>
            )}

            {preview && (
              <p className="mt-2 rounded-md bg-muted p-2 text-sm text-secondary">
                You&apos;ll be charged approximately{" "}
                <span className="font-semibold">{formatNaira(preview.chargedToUserKobo)}</span> — the exact
                amount is confirmed at checkout since rates change.
              </p>
            )}
          </div>
        )}

        {operator && amount && (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              {loading ? "Processing..." : "Send top-up"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
