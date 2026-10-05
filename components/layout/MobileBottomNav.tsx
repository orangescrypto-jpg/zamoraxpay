"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, LayoutGrid, ReceiptText, Gift, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/services/data", label: "Services", icon: LayoutGrid },
  { href: "/history", label: "Activity", icon: ReceiptText },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/settings", label: "More", icon: MoreHorizontal },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  if (!pathname?.startsWith("/dashboard") && !pathname?.startsWith("/wallet") && !pathname?.startsWith("/rewards") && !pathname?.startsWith("/history") && !pathname?.startsWith("/settings")) return null

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/dashboard/"))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition",
                active ? "text-primary" : "text-muted-foreground hover:text-secondary",
              )}
            >
              <span className={cn("flex h-7 w-10 items-center justify-center rounded-full", active && "bg-primary/10")}>
                <Icon className="h-[17px] w-[17px]" />
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
