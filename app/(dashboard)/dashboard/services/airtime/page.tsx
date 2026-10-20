// app/(dashboard)/services/airtime/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { useAuth } from "@/hooks/useAuth"
import { detectNetwork, matchesSelectedNetwork, type NetworkName } from "@/lib/networkDetect"
import { PurchaseReviewDialog } from "@/components/dashboard/PurchaseReviewDialog"
import { ResultBanner } from "@/components/ui/result-banner"
import { AmountChips } from "@/components/ui/amount-chips"
import { PinKeypad } from "@/components/ui/pin-keypad"
import { normalizeNgPhone } from "@/lib/phoneNormalize"
import { RecentPhoneChips } from "@/components/ui/recent-phone-chips"
import { pushRecentPhone } from "@/lib/recentPhones"

const NETWORKS: NetworkName[] = ["MTN", "Airtel", "Glo", "9mobile"]

export default function AirtimePage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [network, setNetwork] = useState<NetworkName>(() => {
    if (typeof window === "undefined") return NETWORKS[0]
    try {
      const saved = localStorage.getItem("zamoraxpay:last-airtime-network")
      if (saved && (NETWORKS as string[]).includes(saved)) return saved as NetworkName
    } catch {}
    return NETWORKS[0]
  })
  const [phone, setPhone] = useState("")
  // Remember last selected network (local only)
  
  function selectNetwork(n: NetworkName) {
    setNetwork(n)
    try { localStorage.setItem("zamoraxpay:last-airtime-network", n) } catch {}

  useEffect(() => {
    const n = searchParams.get("network")
    if (n && (NETWORKS as string[]).includes(n)) selectNetwork(n as NetworkName)
    const ph = searchParams.get("phone")
    if (ph) setPhone(normalizeNgPhone(ph))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  }
  // Pre-fill with the user's own registered number for the common case
  // (buying for self) - still a plain editable input, so switching to
  // someone else's number just means typing over it.
  useEffect(() => {
    if (user?.phone && phone === "") setPhone(user.phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone])
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  // Set when the server rejects the purchase because the number and
  // selected network don't match. This is a hard gate, not a dismissible
  // dialog - the user must explicitly tick a checkbox acknowledging the
  // mismatch and resubmit before the purchase is retried with
  // confirmNetworkMismatch: true. Cleared whenever network or phone
  // changes, so an old confirmation can't silently carry over to a
  // different number.
  const [networkConfirmNeeded, setNetworkConfirmNeeded] = useState<{ detected: string | null } | null>(null)
  const [ackMismatch, setAckMismatch] = useState(false)

  const networkMismatch = phone.length > 0 && !matchesSelectedNetwork(phone, network)
  const detected = detectNetwork(phone)

  useEffect(() => {
    setNetworkConfirmNeeded(null)
    setAckMismatch(false)
  }, [network, phone])

  async function submitPurchase(confirmNetworkMismatch: boolean) {
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again to continue.")

      const res = await fetch("/api/vtu/airtime", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          network,
          phone: phone.trim(),
          amountKobo: Math.round(parseFloat(amount) * 100),
          transactionPin: pin,
          confirmNetworkMismatch,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.requiresNetworkConfirmation) {
        throw new Error(data.message ?? data.error ?? "Airtime purchase could not be completed.")
      }

      if (data.requiresNetworkConfirmation) {
        setNetworkConfirmNeeded({ detected: data.detectedNetwork ?? null })
        return
      }

      setResult({ success: Boolean(data.success), message: data.message ?? data.error ?? "The purchase could not be completed." })
      if (data.success) {
        pushRecentPhone(phone.trim())
        setPhone("")
        setAmount("")
        setPin("")
        setNetworkConfirmNeeded(null)
        setAckMismatch(false)
      }
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Airtime purchase failed. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    if (parseFloat(amount) < 50) {
      setResult({ success: false, message: "Minimum airtime purchase is ₦50" })
      return
    }

    // If we already went through the mismatch confirmation for this
    // exact (network, phone), require the checkbox before showing review.
    if (networkConfirmNeeded && !ackMismatch) return
    setReviewOpen(true)
  }

  async function confirmPurchaseReview() {
    setReviewOpen(false)
    await submitPurchase(Boolean(networkConfirmNeeded))
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-6 text-2xl font-heading font-bold text-secondary">Buy Airtime</h1>

      {result && (
        <ResultBanner
          className="mb-4"
          variant={result.success ? "success" : "error"}
          title={result.success ? "Success" : "Purchase failed"}
          message={result.message}
          onDismiss={() => setResult(null)}
        />
      )}

      <form onSubmit={handleSubmit} className={`space-y-4 ${result && !result.success ? "zpx-shake" : ""}`}>
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Network</label>
          <div className="grid grid-cols-4 gap-2">
            {NETWORKS.map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => selectNetwork(n)}
                className={`rounded-md border py-2 text-sm font-medium transition active:scale-95 ${
                  network === n ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-secondary">Phone number</label>
            {user?.phone && phone !== user.phone && (
              <button
                type="button"
                onClick={() => setPhone(user.phone!)}
                className="text-xs font-medium text-primary underline"
              >
                Use my number
              </button>
            )}
          </div>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(normalizeNgPhone(e.target.value))}
            onPaste={(e) => {
              e.preventDefault()
              const text = e.clipboardData.getData("text")
              setPhone(normalizeNgPhone(text))
            }}
            placeholder="08012345678"
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              networkMismatch ? "border-destructive" : "border-border"
            }`}
          />
          {user?.phone && phone === user.phone && (
            <p className="mt-1 text-xs text-muted-foreground">Buying for yourself. Edit the number above to buy for someone else.</p>
          )}
          <RecentPhoneChips onSelect={setPhone} />
          {networkMismatch ? (
            <p className="mt-1 text-xs text-destructive">
              This looks like a {detected} number, but you selected {network}. Double-check before you pay.
            </p>
          ) : (
            phone.length >= 4 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {detected ? `Detected network: ${detected}` : "Network not recognized from this prefix. You can still proceed"}
              </p>
            )
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Amount (₦)</label>
          <input
            required
            type="number"
            min={50}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">Minimum airtime purchase is ₦50.</p>
          <AmountChips className="mt-3" value={amount} onSelect={(n) => setAmount(String(n))} />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-secondary">Transaction PIN</label>
          <PinKeypad value={pin} onChange={setPin} disabled={loading} />
        </div>

        {networkConfirmNeeded && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              This number looks like it's on {networkConfirmNeeded.detected ?? "a different network"}, not {network}.
              Airtime sent to the wrong network cannot be refunded.
            </p>
            <label className="mt-2 flex items-start gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={ackMismatch}
                onChange={(e) => setAckMismatch(e.target.checked)}
                className="mt-0.5"
              />
              I've checked the number and want to buy {network} airtime for it anyway.
            </label>
          </div>
        )}

        <div className="zpx-sticky-pay pt-2">
        <p className="mb-2 text-center text-xs text-muted-foreground">
          You pay <span className="font-semibold text-secondary dark:text-foreground">{amount && parseFloat(amount) >= 50 ? `₦${parseFloat(amount).toLocaleString("en-NG")}` : "—"}</span>
        </p>
        <button
          type="submit"
          disabled={loading || (!!networkConfirmNeeded && !ackMismatch) || phone.length < 11 || !amount || parseFloat(amount) < 50 || pin.length !== 4}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : networkConfirmNeeded ? "Confirm and buy anyway" : "Buy airtime"}
        </button>
        </div>
      </form>
      <PurchaseReviewDialog
        open={reviewOpen}
        title="Review airtime purchase"
        description="Confirm the network, phone number, and amount before continuing."
        rows={[
          { label: "Network", value: network },
          { label: "Phone number", value: phone.trim() },
          { label: "Amount", value: amount.trim() ? formatNaira(Math.round(Number(amount) * 100)) : "Not provided" },
        ]}
        confirmLabel="Continue to purchase"
        loading={loading}
        onConfirm={confirmPurchaseReview}
        onCancel={() => setReviewOpen(false)}
      />
    </div>
  )
}
