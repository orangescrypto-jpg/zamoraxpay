// app/(admin)/admin/staff/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatDate } from "@/lib/utils"

interface StaffMember {
  id: string
  email: string
  role: string
  created_at: string
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lookupEmail, setLookupEmail] = useState("")
  const [selectedRole, setSelectedRole] = useState("moderator")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setCurrentUserId(session?.user?.id ?? null)

    const res = await fetch("/api/admin/staff", { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const data = await res.json()
    setStaff(data.staff ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    setError(null)
    setAdding(true)

    // Staff must already have a normal ZamoraxPay account — look up
    // their user id by email via the users search endpoint first.
    const headers = await getAuthHeader()
    const lookupRes = await fetch(`/api/admin/users?search=${encodeURIComponent(lookupEmail)}`, { headers })
    const lookupData = await lookupRes.json()
    const match = (lookupData.users ?? []).find((u: any) => u.email?.toLowerCase() === lookupEmail.toLowerCase())

    if (!match) {
      setError("No ZamoraxPay account found with that email. They must sign up first before being promoted to staff.")
      setAdding(false)
      return
    }

    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ userId: match.id, email: match.email, role: selectedRole }),
    })
    const data = await res.json()
    setAdding(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to add staff member")
      return
    }

    setLookupEmail("")
    load()
  }

  async function changeRole(userId: string, role: string) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ userId, role }),
    })
    load()
  }

  async function remove(userId: string) {
    if (!confirm("Remove this person's admin panel access?")) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/staff?userId=${userId}`, { method: "DELETE", headers })
    load()
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-heading font-bold">Staff Access</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        <strong>Moderator</strong> — view users, suspend/reactivate accounts, review fraud flags, view transactions.{" "}
        <strong>Admin</strong> — everything above, plus feature flags, pricing, banners, pages, blog, provider settings.{" "}
        <strong>Super Admin</strong> — everything above, plus provider credentials, permanent user deletion, and managing staff access.
      </p>

      <div className="mb-8 rounded-lg border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Add Staff Member</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          The person must already have a regular ZamoraxPay account (via normal signup) before you can promote them.
        </p>
        {error && <p className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <input
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            placeholder="Their account email"
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !lookupEmail}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
              <div>
                <p className="text-sm font-medium text-secondary">{s.email}</p>
                <p className="text-xs text-muted-foreground">Added {formatDate(s.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={s.role}
                  onChange={(e) => changeRole(s.id, e.target.value)}
                  disabled={s.id === currentUserId}
                  className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                {s.id !== currentUserId && (
                  <button onClick={() => remove(s.id)} className="text-sm text-destructive hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {staff.length === 0 && <p className="text-sm text-muted-foreground">No staff members yet.</p>}
        </div>
      )}
    </div>
  )
}
