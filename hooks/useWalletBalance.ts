// hooks/useWalletBalance.ts
// NEW: shared wallet-balance hook for purchase forms (audit finding:
// "no balance awareness inside purchase forms — an over-balance attempt
// is only discovered after PIN entry, review dialog and a server
// round-trip").
//
// Fetches /api/wallet/balance with a 30s client-side cache via
// useAuthCachedFetch (same localStorage envelope as pricing), exposes
// formatted helpers, and an `isEnough(kobo)` check the sticky summary
// bar renders next to "You pay". The hook also clears the cache and
// refetches after a purchase lands, so the balance the user sees never
// goes stale right after they spend.

"use client"

import { useCallback } from "react"
import { useAuthCachedFetch } from "@/hooks/useCachedFetch"
import { remove } from "@/lib/storage"

const STORAGE_KEY = "wallet:balance"
const STORAGE_VERSION = 1
const TTL_MS = 30_000

export interface WalletBalance {
  balanceKobo: number
  cashbackKobo: number
}

export function useWalletBalance() {
  const {
    data,
    loading,
    error,
    mutate,
    isStale,
  } = useAuthCachedFetch<WalletBalance>("/api/wallet/balance", {
    storageKey: STORAGE_KEY,
    storageVersion: STORAGE_VERSION,
    ttlMs: TTL_MS,
    fallback: { balanceKobo: 0, cashbackKobo: 0 },
    transform: (raw) => ({
      balanceKobo: (raw as { balanceKobo?: number }).balanceKobo ?? 0,
      cashbackKobo: (raw as { cashbackKobo?: number }).cashbackKobo ?? 0,
    }),
  })

  /** Force a fresh fetch (e.g. after a purchase). Bypasses TTL. */
  const refresh = useCallback(async () => {
    remove(`zamoraxpay:${STORAGE_KEY}:v${STORAGE_VERSION}`)
    await mutate()
  }, [mutate])

  const isEnough = useCallback(
    (kobo: number | null | undefined) =>
      kobo == null ? null : data.balanceKobo >= kobo,
    [data.balanceKobo],
  )

  return {
    balanceKobo: data.balanceKobo,
    cashbackKobo: data.cashbackKobo,
    loading,
    error,
    isStale,
    refresh,
    isEnough,
  }
}
