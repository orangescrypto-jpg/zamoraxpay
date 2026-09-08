// app/(admin)/admin/withdrawals/page.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface WithdrawalRow {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string
  amount_kobo: number
  fee_kobo: number
  net_amount_kobo: number
  bank_name: string
  account_number: string
  account_name: string
  bank_code: string | null
  status: string
  created_at: string
}

export default function AdminWithdrawalsPage() {
  const [statusFilter, setStatusFilter] = useState("pending")
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [payoutMethod, setPayoutMethod] = useState<"manual" | "automatic">("manual")
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [provider, setProvider] = useState<"korapay" | "paystack">("korapay")
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/withdrawals?status=${statusFilter}`, { headers })
    const data = await res.json()
    setWithdrawals(data.withdrawals ?? [])
    setPayoutMethod(data.payoutMethod ?? "manual")
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function handleReject(id: string) {
    const reason = prompt("Reason for rejecting this withdrawal (the amount will be refunded to their wallet):")
    if (!reason) return

    setProcessing(id)
    const headers = await getAuthHeader()
    await fetch(`/api/admin/withdrawals/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ reason }),
    })
    setProcessing(null)
    load()
  }

  async function handleApproveManual(id: string, proofUrl: string | null) {
    setProcessing(id)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ mode: "manual", proofUrl }),
    })
    const data = await res.json()
    setProcessing(null)
    if (!res.ok) alert(data.error ?? "Failed to mark as paid")
    load()
  }

  async function handleApproveAutomated(id: string) {
    if (!confirm(`Send this payout automatically via ${provider === "korapay" ? "Korapay" : "Paystack"}? This will move real money.`)) return

    setProcessing(id)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ mode: "automated", provider }),
    })
    const data = await res.json()
    setProcessing(null)
    if (!res.ok) alert(data.error ?? "Transfer failed")
    else alert(data.message)
    load()
  }

  async function handleUploadProof(id: string, file: File) {
    setUploadingFor(id)
    const headers = await getAuthHeader()
    const formData = new FormData()
    formData.append("file", file)
    const uploadRes = await fetch("/api/admin/upload", { method: "POST", headers, body: formData })
    const uploadData = await uploadRes.json()
    setUploadingFor(null)

    if (!uploadRes.ok) {
      alert(uploadData.error ?? "Upload failed")
      return
    }

    await handleApproveManual(id, uploadData.url)
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-heading font-bold">Withdrawals</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Site-wide payout mode is currently set to{" "}
        <strong>{payoutMethod === "automatic" ? "Automatic" : "Manual"}</strong> (change this in Site Settings). You
        can still choose manual or automated per-withdrawal below regardless of that default.
      </p>

      <div className="mb-4 flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>

        {statusFilter === "pending" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Automated payout via:</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "korapay" | "paystack")}
              className="rounded-md border border-border px-2 py-1 text-sm"
            >
              <option value="korapay">Korapay</option>
              <option value="paystack">Paystack</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : withdrawals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No withdrawals with this status.</p>
      ) : (
        <div className="space-y-3">
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-lg border border-border bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-secondary">{w.full_name} · {w.phone}</p>
                  <p className="text-xs text-muted-foreground">{w.email} · {formatDate(w.created_at)}</p>
                </div>
                <p className="text-lg font-heading font-bold text-secondary">{formatNaira(w.net_amount_kobo)}</p>
              </div>

              <div className="mb-3 rounded-md bg-bg p-3 text-sm">
                <p><strong>Bank:</strong> {w.bank_name}</p>
                <p><strong>Account number:</strong> {w.account_number}</p>
                <p><strong>Account name:</strong> {w.account_name}</p>
                <p className="text-xs text-muted-foreground">
                  Requested: {formatNaira(w.amount_kobo)} — Fee: {formatNaira(w.fee_kobo)} — Net: {formatNaira(w.net_amount_kobo)}
                </p>
                <p className="mt-1 text-xs text-accent">
                  ✓ Confirmed: this account matches one the user has funded their wallet from before.
                </p>
              </div>

              {statusFilter === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleApproveManual(w.id, null)}
                    disabled={processing === w.id}
                    className="rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-50"
                  >
                    Mark as paid (sent manually)
                  </button>
                  <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary">
                    {uploadingFor === w.id ? "Uploading..." : "Mark paid + attach proof"}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadProof(w.id, file)
                      }}
                    />
                  </label>
                  <button
                    onClick={() => handleApproveAutomated(w.id)}
                    disabled={processing === w.id}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {processing === w.id ? "Sending..." : `Approve & send via ${provider === "korapay" ? "Korapay" : "Paystack"}`}
                  </button>
                  <button
                    onClick={() => handleReject(w.id)}
                    disabled={processing === w.id}
                    className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-50"
                  >
                    Reject & refund
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
