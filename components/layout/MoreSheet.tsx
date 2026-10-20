"use client"

import Link from "next/link"
import {
  Settings,
  Wallet,
  UserCircle,
  LogOut,
  Store,
  FileText,
  Shield,
  HelpCircle,
  X,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

interface MoreSheetProps {
  open: boolean
  onClose: () => void
  onSignOut?: () => void
  isAuthenticated?: boolean
}

const LINKS = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/reseller", label: "Become a Reseller", icon: Store },
  { href: "/refund", label: "Refund", icon: HelpCircle },
  { href: "/privacy-policy", label: "Privacy", icon: Shield },
  { href: "/terms", label: "Terms", icon: FileText },
]

export function MoreSheet({ open, onClose, onSignOut, isAuthenticated }: MoreSheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="More menu">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-secondary dark:text-foreground">More</p>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1 p-3">
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
            <span className="text-sm font-medium text-secondary dark:text-foreground">Theme</span>
            <ThemeToggle variant="full" />
          </div>
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-secondary hover:bg-muted dark:text-foreground active:scale-[0.99]"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              {label}
            </Link>
          ))}
          {isAuthenticated && onSignOut && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onSignOut()
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 active:scale-[0.99]"
            >
              <LogOut className="h-5 w-5" />
              Sign out
            </button>
          )}
          {!isAuthenticated && (
            <Link
              href="/login"
              onClick={onClose}
              className="flex min-h-12 items-center gap-3 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <UserCircle className="h-5 w-5" />
              Log in
            </Link>
          )}
          <div className="mt-4 space-y-1 rounded-2xl border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-secondary dark:text-foreground">Notifications tip</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              For quieter evenings, mute device notifications system-wide. In-app alerts still work when you open ZamoraxPay.
            </p>
          </div>
          <p className="mt-3 px-1 text-center text-[10px] text-muted-foreground">ZamoraxPay · UI pack</p>
        </div>
        <div className="h-[max(0.75rem,env(safe-area-inset-bottom))]" />
      </div>
    </div>
  )
}
