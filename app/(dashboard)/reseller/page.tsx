// app/(dashboard)/reseller/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"

export default function ResellerPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeResult, setUpgradeResult] = useState<{ success: boolean; message: string } | null>(null)
  const [bvn, setBvn] = useState("")
  const [bvnLoading, setBvnLoading] = useState(false)
  const [bvnResult, setBvnResult] = useState<{ success: boolean; message: string } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function handleUpgrade() {
    setUpgrading(true)
    setUpgradeResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/reseller/upgrade", { method: "POST", headers })
    const data = await res.json()
    setUpgrading(false)
    setUpgradeResult({ success: res.ok, message: data.message ?? data.error })
    if (res.ok) router.refresh()
  }

  async function handleVerifyBvn(e: React.FormEvent) {
    e.preventDefault()
    setBvnLoading(true)
    setBvnResult(null)
    const headers = await getAuthHeader()
    const res = await fetch("/api/reseller/bvn-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ bvn }),
    })
    const data = await res.json()
    setBvnLoading(false)
    setBvnResult({ success: res.ok, message: data.message ?? data.error })
    if (res.ok) setBvn("")
  }

  const isReseller = user?.tier === "reseller"

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-2 text-2xl font-heading font-bold text-secondary">Become a Reseller</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Unlock wholesale pricing on every airtime, data, and bill purchase.
      </p>

      {isReseller ? (
        <div className="mb-8 rounded-lg bg-accent/10 p-4 text-sm text-accent">
          You&apos;re already on the reseller tier. Wholesale pricing is active on your account.
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-border p-5">
          <p className="mb-3 text-sm text-secondary">
            A one-time upgrade fee of ₦3,000 will be deducted from your wallet balance.
          </p>
          {upgradeResult && (
            <p className={`mb-3 rounded-md p-3 text-sm ${upgradeResult.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
              {upgradeResult.message}
            </p>
          )}
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {upgrading ? "Upgrading..." : "Upgrade to reseller"}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border p-5">
        <h2 className="mb-1 font-heading font-semibold text-secondary">Higher wholesale limits</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Verify your BVN to unlock higher wholesale purchase limits. This is optional and separate from the
          reseller upgrade above.
        </p>

        {bvnResult && (
          <p className={`mb-3 rounded-md p-3 text-sm ${bvnResult.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
            {bvnResult.message}
          </p>
        )}

        <form onSubmit={handleVerifyBvn} className="flex gap-2">
          <input
            required
            value={bvn}
            onChange={(e) => setBvn(e.target.value)}
            maxLength={11}
            placeholder="Enter your 11-digit BVN"
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={bvnLoading}
            className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
          >
            {bvnLoading ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    </div>
  )
}
