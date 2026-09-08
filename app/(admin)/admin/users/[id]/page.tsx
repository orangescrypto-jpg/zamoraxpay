// app/(admin)/admin/users/[id]/page.tsx
"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface DetailData {
  user: {
    id: string
    phone: string
    email: string
    fullName: string
    tier: string
    status: string
    referralCode: string
    hasTransactionPin: boolean
    createdAt: string
  }
  supabase: { emailConfirmedAt: string | null; lastSignInAt: string | null } | null
  wallet: { balance_kobo: number; cashback_kobo: number } | null
  bvnVerification: { status: string; bvn_masked: string } | null
  recentOrders: any[]
  recentWalletTransactions: any[]
  fraudFlags: any[]
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<DetailData | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/users/${id}`, { headers })
    if (res.ok) setData(await res.json())
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function changeStatus(status: string) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ userId: id, status }),
    })
    load()
  }

  async function handleDelete() {
    if (!confirm("Permanently delete this user and all their data? This cannot be undone.")) return
    if (!confirm("Are you absolutely sure? Type-to-confirm is not required, but this really cannot be undone.")) return

    setDeleting(true)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers })
    const result = await res.json()
    setDeleting(false)

    if (!res.ok) {
      alert(result.error ?? "Delete failed")
      return
    }
    if (result.warning) alert(result.warning)
    router.push("/admin/users")
  }

  if (!data) return <div className="p-6 text-muted-foreground">Loading...</div>

  const { user, supabase, wallet, bvnVerification, recentOrders, recentWalletTransactions, fraudFlags } = data

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">{user.fullName}</h1>
        <div className="flex gap-2">
          {user.status === "active" ? (
            <button onClick={() => changeStatus("suspended")} className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">
              Suspend
            </button>
          ) : (
            <button onClick={() => changeStatus("active")} className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent">
              Reactivate
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete permanently"}
          </button>
        </div>
      </div>

      {/* Contact & account info */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h2 className="mb-3 font-heading font-semibold text-secondary">Account Information</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="Email" value={user.email} />
          <Field label="Phone" value={user.phone} />
          <Field label="Tier" value={user.tier} capitalize />
          <Field label="Status" value={user.status} capitalize />
          <Field label="Referral code" value={user.referralCode} />
          <Field label="Transaction PIN set" value={user.hasTransactionPin ? "Yes" : "No"} />
          <Field label="Email confirmed" value={supabase?.emailConfirmedAt ? formatDate(supabase.emailConfirmedAt) : "Not confirmed"} />
          <Field label="Last sign-in" value={supabase?.lastSignInAt ? formatDate(supabase.lastSignInAt) : "—"} />
          <Field label="Joined" value={formatDate(user.createdAt)} />
        </dl>
      </div>

      {/* Wallet */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h2 className="mb-3 font-heading font-semibold text-secondary">Wallet</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="Balance" value={formatNaira(wallet?.balance_kobo ?? 0)} />
          <Field label="Lifetime cashback" value={formatNaira(wallet?.cashback_kobo ?? 0)} />
        </dl>
      </div>

      {/* BVN */}
      {bvnVerification && (
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="mb-3 font-heading font-semibold text-secondary">BVN Verification</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Status" value={bvnVerification.status} capitalize />
            <Field label="BVN (masked)" value={bvnVerification.bvn_masked} />
          </dl>
        </div>
      )}

      {/* Fraud flags */}
      {fraudFlags.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="mb-3 font-heading font-semibold text-destructive">Fraud Flags</h2>
          <ul className="space-y-1 text-sm">
            {fraudFlags.map((f: any) => (
              <li key={f.id}>
                {f.reason.replace(/_/g, " ")} — <span className="text-muted-foreground">{f.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent orders */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h2 className="mb-3 font-heading font-semibold text-secondary">Recent Orders</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {recentOrders.slice(0, 20).map((o: any) => (
              <div key={o.id} className="flex justify-between text-sm">
                <span className="capitalize text-secondary">{o.service_type.replace("_", " ")} — {o.network_or_biller}</span>
                <span className="text-muted-foreground">{formatNaira(o.amount_kobo)} · {o.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent wallet transactions */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h2 className="mb-3 font-heading font-semibold text-secondary">Recent Wallet Activity</h2>
        {recentWalletTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <div className="space-y-2">
            {recentWalletTransactions.slice(0, 20).map((t: any) => (
              <div key={t.id} className="flex justify-between text-sm">
                <span className="capitalize text-secondary">{t.type.replace("_", " ")} ({t.direction})</span>
                <span className="text-muted-foreground">{formatNaira(t.amount_kobo)} · {t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={capitalize ? "capitalize text-secondary" : "text-secondary"}>{value}</dd>
    </>
  )
}
