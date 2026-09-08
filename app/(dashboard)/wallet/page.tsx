// app/(dashboard)/wallet/page.tsx
"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000] // kobo

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletPageInner />
    </Suspense>
  )
}

function WalletPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "checking" | "success" | "failed">("idle")

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadBalance() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/wallet/balance", { headers })
    const data = await res.json()
    setBalanceKobo(data.balanceKobo ?? 0)
  }

  useEffect(() => {
    loadBalance()
  }, [])

  // Safety net: if the user is redirected back from Korapay before the
  // webhook has landed, actively confirm the payment ourselves instead
  // of leaving them staring at a stale balance. Polls briefly since
  // Korapay may report "pending" for a moment after redirect.
  useEffect(() => {
    const funding = searchParams.get("funding")
    const reference = searchParams.get("reference")
    if (funding !== "complete" || !reference) return

    let cancelled = false
    setVerifyStatus("checking")

    async function poll(attempt: number) {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/wallet/fund/verify?reference=${encodeURIComponent(reference!)}`, { headers })
      const data = await res.json()
      if (cancelled) return

      if (data.status === "success") {
        setVerifyStatus("success")
        setBalanceKobo(data.newBalanceKobo)
        router.replace("/wallet")
        return
      }

      if (data.status === "failed") {
        setVerifyStatus("failed")
        return
      }

      // still pending — retry a few times before giving up
      if (attempt < 5) {
        setTimeout(() => poll(attempt + 1), 2000)
      } else {
        setVerifyStatus("failed")
      }
    }

    poll(0)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFund() {
    setError(null)
    const amountKobo = Math.round(parseFloat(amount) * 100)
    if (!amountKobo || amountKobo < 10000) {
      setError("Minimum funding amount is ₦100")
      return
    }

    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/wallet/fund", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ amountKobo }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to initialize payment")
      return
    }

    window.location.href = data.authorizationUrl
  }

  return (
    <div className="container max-w-md py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold text-secondary">Wallet</h1>
        <Link href="/withdraw" className="text-sm font-medium text-primary hover:underline">
          Withdraw →
        </Link>
      </div>

      {verifyStatus === "checking" && (
        <p className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
          Confirming your payment…
        </p>
      )}
      {verifyStatus === "success" && (
        <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Payment confirmed — your wallet has been credited.
        </p>
      )}
      {verifyStatus === "failed" && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          We couldn't confirm this payment yet. If you were charged, it should reflect shortly —
          contact support if your balance doesn't update within a few minutes.
        </p>
      )}

      <div className="mb-6 rounded-lg bg-secondary p-6 text-white">
        <p className="text-sm text-white/70">Current balance</p>
        <p className="mt-1 text-3xl font-heading font-bold">
          {balanceKobo === null ? "..." : formatNaira(balanceKobo)}
        </p>
      </div>

      <h2 className="mb-3 font-heading font-semibold text-secondary">Fund your wallet</h2>

      {error && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="mb-3 grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((kobo) => (
          <button
            key={kobo}
            onClick={() => setAmount((kobo / 100).toString())}
            className="rounded-md border border-border py-2 text-sm font-medium hover:border-primary hover:text-primary"
          >
            ₦{(kobo / 100).toLocaleString()}
          </button>
        ))}
      </div>

      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Enter amount"
        className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm"
      />

      <button
        onClick={handleFund}
        disabled={loading || !amount}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Redirecting to payment..." : "Fund wallet"}
      </button>
    </div>
  )
}
