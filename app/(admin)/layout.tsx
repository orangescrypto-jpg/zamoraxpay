// app/(admin)/layout.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/src/services/providers/supabase/client"

// minRole is the lowest role that can see (and use) this link. The
// real enforcement lives in each API route's requireStaff/requireAdmin/
// requireSuperAdmin call — this list only controls what's shown, so a
// moderator isn't tempted to click into a page full of 401s.
const NAV_ITEMS: { href: string; label: string; minRole: "moderator" | "admin" | "super_admin" }[] = [
  { href: "/admin", label: "Dashboard", minRole: "admin" },
  { href: "/admin/feature-flags", label: "Feature Flags", minRole: "admin" },
  { href: "/admin/providers", label: "Providers", minRole: "admin" },
  { href: "/admin/pricing", label: "Pricing", minRole: "admin" },
  { href: "/admin/banners", label: "Banners", minRole: "admin" },
  { href: "/admin/pages", label: "Site Pages", minRole: "admin" },
  { href: "/admin/blog", label: "Blog", minRole: "admin" },
  { href: "/admin/blog-categories", label: "Blog Categories", minRole: "admin" },
  { href: "/admin/settings", label: "Site Settings", minRole: "admin" },
  { href: "/admin/users", label: "Users", minRole: "moderator" },
  { href: "/admin/transactions", label: "Transactions", minRole: "moderator" },
  { href: "/admin/withdrawals", label: "Withdrawals", minRole: "admin" },
  { href: "/admin/fraud", label: "Fraud", minRole: "moderator" },
  { href: "/admin/staff", label: "Staff Access", minRole: "super_admin" },
]

const ROLE_RANK: Record<string, number> = { moderator: 1, admin: 2, super_admin: 3 }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    async function loadRole() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/me", { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) {
        const data = await res.json()
        setRole(data.role)
      }
    }
    loadRole()
  }, [])

  const visibleItems = role
    ? NAV_ITEMS.filter((item) => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[item.minRole])
    : []

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border bg-secondary text-white">
        <div className="border-b border-white/10 p-4">
          <p className="font-heading font-bold">ZamoraxPay Admin</p>
          {role && <p className="text-xs capitalize text-white/50">{role.replace("_", " ")}</p>}
        </div>
        <nav className="space-y-1 p-3">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium",
                pathname === item.href ? "bg-primary text-primary-foreground" : "text-white/70 hover:bg-white/10",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 bg-bg">{children}</div>
    </div>
  )
}
