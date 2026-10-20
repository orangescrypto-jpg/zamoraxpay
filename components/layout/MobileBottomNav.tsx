"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, LayoutGrid, ReceiptText, Gift, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { MoreSheet } from "@/components/layout/MoreSheet"
import { useAuth } from "@/hooks/useAuth"

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/services/data", label: "Services", icon: LayoutGrid },
  { href: "/history", label: "Activity", icon: ReceiptText },
  { href: "/rewards", label: "Rewards", icon: Gift },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  if (
    !pathname?.startsWith("/dashboard") &&
    !pathname?.startsWith("/wallet") &&
    !pathname?.startsWith("/rewards") &&
    !pathname?.startsWith("/history") &&
    !pathname?.startsWith("/settings") &&
    !pathname?.startsWith("/refund") &&
    !pathname?.startsWith("/reseller")
  ) {
    return null
  }

  const moreActive = moreOpen || pathname?.startsWith("/settings")

  async function handleSignOut() {
    await signOut()
    window.location.href = "/"
  }

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        data-mobile-bottom-nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href === "/dashboard" && pathname.startsWith("/dashboard/"))
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition active:scale-95",
                  active ? "text-primary" : "text-muted-foreground hover:text-secondary"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-10 items-center justify-center rounded-full transition",
                    active && "bg-primary/10 shadow-sm"
                  )}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </span>
                {label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-label="More menu"
            className={cn(
              "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition active:scale-95",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-secondary"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-10 items-center justify-center rounded-full transition",
                moreActive && "bg-primary/10 shadow-sm"
              )}
            >
              <MoreHorizontal className="h-[17px] w-[17px]" />
            </span>
            More
          </button>
        </div>
      </nav>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        isAuthenticated={!!isAuthenticated}
        onSignOut={handleSignOut}
      />
    </>
  )
}
