// app/(dashboard)/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/useAuth"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira } from "@/lib/utils"

const SERVICES = [
  { href: "/services/airtime", label: "Airtime" },
  { href: "/services/data", label: "Data" },
  { href: "/services/cable", label: "Cable TV" },
  { href: "/services/electricity", label: "Electricity" },
  { href: "/services/exam-pin", label: "Exam PINs" },
  { href: "/services/betting", label: "Betting" },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const [balanceKobo, setBalanceKobo] = useState<number | null>(null)

  useEffect(() => {
    async function loadBalance() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/wallet/balance", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setBalanceKobo(data.balanceKobo ?? 0)
    }
    loadBalance()
  }, [])

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">
        Hi{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""} 👋
      </h1>
      <p className="mb-6 text-muted-foreground">What would you like to do today?</p>

      <div className="mb-8 rounded-lg bg-secondary p-6 text-white">
        <p className="text-sm text-white/70">Wallet balance</p>
        <p className="mt-1 text-3xl font-heading font-bold">
          {balanceKobo === null ? "..." : formatNaira(balanceKobo)}
        </p>
        <Link
          href="/wallet"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Fund wallet
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SERVICES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-border p-4 text-center font-medium text-secondary hover:border-primary hover:text-primary"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {user?.tier === "retail" && (
        <div className="mt-8 rounded-lg border border-dashed border-accent p-4">
          <p className="text-sm font-medium text-secondary">Buying in bulk?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrade to a reseller account for wholesale pricing on every purchase.
          </p>
          <Link href="/reseller" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            Become a reseller →
          </Link>
        </div>
      )}
    </div>
  )
}
