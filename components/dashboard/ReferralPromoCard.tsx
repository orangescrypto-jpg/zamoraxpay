// components/dashboard/ReferralPromoCard.tsx
//
// Dashboard card combining two competitor-inspired widgets backed by
// APIs that already exist (no new backend):
//
// 1. Referral progress — shows the user's referral code, total invited
//    friends, and claimable bonus, with a one-tap copy for the invite
//    link. Reads GET /api/referrals via the shared cached-fetch hook
//    (30s TTL keeps repeat dashboard mounts free of extra network work).
//
// 2. Promo banner — surfaces the active dashboard-announcement banner
//    (GET /api/banners?placement=dashboard) so ops promos reach logged-in
//    users, not just storefront visitors. Rendered only when the API
//    returns one; degrades to nothing (no empty box) when unset.
//
// Both sections fail silent on error — the dashboard must never look
// broken because a secondary card couldn't load.

"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Copy, Gift, Users } from "lucide-react"
import { useAuthCachedFetch } from "@/hooks/useCachedFetch"
import { formatNaira } from "@/lib/utils"

interface ReferralData {
  referralCode: string | null
  bonusPerReferralKobo: number
  totalReferrals: number
  totalEarnedKobo: number
  unclaimedKobo: number
}

interface Banner {
  id: number
  title: string
  imageUrl?: string | null
  linkUrl?: string | null
}

export function ReferralPromoCard() {
  const [copied, setCopied] = useState(false)

  const referrals = useAuthCachedFetch<ReferralData | null>("/api/referrals", {
    storageKey: "dashboard-referrals",
    ttlMs: 30_000,
    fallback: null,
  })

  const banners = useAuthCachedFetch<Banner[] | null>("/api/banners?placement=dashboard", {
    storageKey: "dashboard-banners",
    ttlMs: 300_000, // banners rarely change — 5 min is plenty
    fallback: null,
  })

  const promo = banners.data?.[0]
  const referral = referrals.data

  async function handleCopyLink() {
    if (!referral?.referralCode) return
    try {
      const link = `${window.location.origin}/signup?ref=${referral.referralCode}`
      await navigator.clipboard?.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard unavailable — the code itself is visible on the card
      // for manual sharing, so fail without noise.
    }
  }

  // Nothing to show yet (first paint, both loading with no cache) —
  // render nothing rather than an empty skeleton box. The card pops in
  // once data lands, usually within one frame of the balance card.
  const referralReady = referral?.referralCode
  const promoReady = Boolean(promo?.title)
  if (!referralReady && !promoReady) return null

  return (
    <div className="grid grid-cols-1 gap-3">
      {promoReady && promo && (
        <Link
          href={promo.linkUrl || "/rewards"}
          className="group flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-primary/5 p-4 shadow-sm transition hover:border-primary/50"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Gift className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-secondary dark:text-foreground">{promo.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Tap to learn more</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {referralReady && referral && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-secondary dark:text-foreground">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                Invite friends, earn {formatNaira(referral.bonusPerReferralKobo)}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {referral.totalReferrals === 0
                  ? "Share your code — you both earn when they make their first purchase."
                  : `${referral.totalReferrals} friend${referral.totalReferrals === 1 ? "" : "s"} invited · ${formatNaira(referral.totalEarnedKobo)} earned`}
              </p>
            </div>
            <Link href="/referrals" className="shrink-0 text-xs font-semibold text-primary hover:underline">
              Details
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm font-semibold tracking-wider text-secondary dark:text-foreground">
              {referral.referralCode}
            </code>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              aria-label="Copy your referral link"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy link
                </>
              )}
            </button>
          </div>

          {referral.unclaimedKobo > 0 && (
            <p className="mt-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {formatNaira(referral.unclaimedKobo)} in bonuses ready to claim —{" "}
              <Link href="/rewards" className="underline underline-offset-2">
                claim now
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
