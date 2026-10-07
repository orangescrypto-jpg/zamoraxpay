// app/(dashboard)/wallet/page.tsx
"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"
import { Eye, EyeOff, ShieldCheck } from "lucide-react"

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000] // kobo

export default function WalletPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <WalletPageInner />
    </Suspense>
  )
}

function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="container max-w-md py-8"><div className="mb-6 h-8 w-36 animate-pulse rounded-lg bg-muted" /><div className="mb-6 h-32 animate-pulse rounded-2xl bg-muted" /><div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div></div>
}

function WalletPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "checking" | "success" | "failed">("idle")
  const [confirmFund, setConfirmFund] = useState(false)
  const [balanceVisible, setBalanceVisible] = useState(true)

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
    try { setBalanceVisible(window.localStorage.getItem("zamoraxpay:show-balance") !== "0") } catch {}
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
        <Link href="/refund" className="text-sm font-medium text-primary hover:underline">
          Refund →
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

      <div className="mb-6 overflow-hidden rounded-2xl bg-secondary p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">Current balance</p>
          <button type="button" onClick={() => setBalanceVisible((value) => !value)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label={balanceVisible ? "Hide wallet balance" : "Show wallet balance"}>
            {balanceVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-3xl font-heading font-bold tracking-tight">
          {balanceKobo === null ? <span className="block h-9 w-44 animate-pulse rounded-lg bg-white/15" /> : balanceVisible ? formatNaira(balanceKobo) : "₦••••••"}
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-white/55"><ShieldCheck className="h-3.5 w-3.5" /> Balance protected by your account security.</div>
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
        onClick={() => setConfirmFund(true)}
        disabled={loading || !amount}
        className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
      >
        {loading ? "Redirecting to payment..." : "Fund wallet"}
      </button>

      {confirmFund && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-secondary/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm wallet funding">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Review funding</p>
            <h2 className="mt-1 text-xl font-heading font-bold text-secondary">Fund your wallet?</h2>
            <p className="mt-2 text-sm text-muted-foreground">You are about to fund your wallet with <strong className="text-secondary">{formatNaira(Math.round(parseFloat(amount || "0") * 100))}</strong>.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmFund(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-secondary hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => { setConfirmFund(false); void handleFund() }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
