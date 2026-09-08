// app/(admin)/admin/users/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import { formatNaira, formatDate } from "@/lib/utils"

interface AdminUserRow {
  id: string
  phone: string
  email: string | null
  fullName: string
  tier: string
  status: string
  balanceKobo: number
  createdAt: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load(searchTerm = "") {
    setLoading(true)
    const headers = await getAuthHeader()
    const url = searchTerm ? `/api/admin/users?search=${encodeURIComponent(searchTerm)}` : "/api/admin/users"
    const res = await fetch(url, { headers })
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function changeStatus(userId: string, status: string) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ userId, status }),
    })
    load(search)
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Users</h1>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="Search by phone, email, or name"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-sm"
        />
        <button onClick={() => load(search)} className="rounded-md border border-border px-4 py-2 text-sm">
          Search
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/users/${u.id}`} className="text-primary hover:underline">
                      {u.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{u.phone}</td>
                  <td className="px-4 py-3 capitalize">{u.tier}</td>
                  <td className="px-4 py-3">{formatNaira(u.balanceKobo)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-accent/10 text-accent"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    {u.status === "active" ? (
                      <button onClick={() => changeStatus(u.id, "suspended")} className="text-xs text-destructive hover:underline">
                        Suspend
                      </button>
                    ) : (
                      <button onClick={() => changeStatus(u.id, "active")} className="text-xs text-accent hover:underline">
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
