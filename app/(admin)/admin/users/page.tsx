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

  const StatusBadge = ({ status }: { status: string }) => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "active" ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
      }`}
    >
      {status}
    </span>
  )

  const ActionButton = ({ u }: { u: AdminUserRow }) =>
    u.status === "active" ? (
      <button onClick={() => changeStatus(u.id, "suspended")} className="text-xs text-destructive hover:underline">
        Suspend
      </button>
    ) : (
      <button onClick={() => changeStatus(u.id, "active")} className="text-xs text-accent hover:underline">
        Reactivate
      </button>
    )

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-heading font-bold sm:mb-6 sm:text-2xl">Users</h1>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="Search by phone, email, or name"
          className="w-full rounded-md border border-border px-3 py-2 text-sm sm:max-w-sm"
        />
        <button
          onClick={() => load(search)}
          className="w-full rounded-md border border-border px-4 py-2 text-sm sm:w-auto"
        >
          Search
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-8 text-center text-muted-foreground">
          No users found.
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
                    {u.fullName}
                  </Link>
                  <StatusBadge status={u.status} />
                </div>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="text-right">{u.phone}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-right break-all">{u.email ?? "—"}</dd>
                  <dt className="text-muted-foreground">Tier</dt>
                  <dd className="text-right capitalize">{u.tier}</dd>
                  <dt className="text-muted-foreground">Balance</dt>
                  <dd className="text-right">{formatNaira(u.balanceKobo)}</dd>
                  <dt className="text-muted-foreground">Joined</dt>
                  <dd className="text-right">{formatDate(u.createdAt)}</dd>
                </dl>
                <div className="mt-3 border-t border-border pt-2 text-right">
                  <ActionButton u={u} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop/tablet: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
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
                    <td className="px-4 py-3">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">{u.tier}</td>
                    <td className="px-4 py-3">{formatNaira(u.balanceKobo)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <ActionButton u={u} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
