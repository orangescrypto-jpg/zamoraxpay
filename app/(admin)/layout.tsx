// app/(admin)/layout.tsx
"use client"

// All admin pages are auth-gated, client-only dashboards with no
// meaningful static content — force dynamic rendering so Next.js
// doesn't attempt to prerender them at build time (prerendering can
// crash pages that touch browser-only APIs like localStorage).
export const dynamic = "force-dynamic"

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
  { href: "/admin/provider-plans", label: "Provider Plans", minRole: "admin" },
  { href: "/admin/pricing", label: "Pricing", minRole: "admin" },
  { href: "/admin/banners", label: "Banners", minRole: "admin" },
  { href: "/admin/dashboard-announcement", label: "Dashboard Announcement", minRole: "admin" },
  { href: "/admin/pages", label: "Site Pages", minRole: "admin" },
  { href: "/admin/blog", label: "Blog", minRole: "admin" },
  { href: "/admin/blog-categories", label: "Blog Categories", minRole: "admin" },
  { href: "/admin/settings", label: "Site Settings", minRole: "admin" },
  { href: "/admin/weekend-bonus", label: "Weekend Bonus", minRole: "admin" },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  // Close the sidebar automatically whenever the route changes — otherwise
  // it stays open on mobile, covering the page you just navigated to.
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const visibleItems = role
    ? NAV_ITEMS.filter((item) => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[item.minRole])
    : []

  return (
    <div className="flex min-h-screen">
      {/* Backdrop — only rendered (and clickable) while the sidebar is open on mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-secondary text-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <p className="font-heading font-bold">ZamoraxPay Admin</p>
            {role && <p className="text-xs capitalize text-white/50">{role.replace("_", " ")}</p>}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 lg:hidden"
          >
            ✕
          </button>
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

      <div className="min-w-0 flex-1 bg-bg lg:ml-0">
        <div className="sticky top-0 z-20 flex items-center border-b border-border bg-white p-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-secondary"
          >
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-5 bg-secondary" />
              <span className="block h-0.5 w-5 bg-secondary" />
              <span className="block h-0.5 w-5 bg-secondary" />
            </span>
          </button>
          <p className="ml-3 font-heading font-semibold text-secondary">ZamoraxPay Admin</p>
        </div>
        {children}
      </div>
    </div>
  )
}
