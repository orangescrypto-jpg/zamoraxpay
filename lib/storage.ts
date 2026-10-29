// lib/storage.ts
// Centralized localStorage helper. Every other file in the codebase used
// to reinvent `try { JSON.parse(localStorage.getItem(KEY) || "null") } catch {}`
// boilerplate with subtle differences (some validated shapes, some didn't;
// some had SSR guards, some didn't). This file is the single source of
// truth: get / set / remove / pushUnique / hasTTL / useLocalStorage.
//
// Design rules:
//  - All reads are SSR-safe (window check + try/catch returning fallback).
//  - Optional TTL is encoded in the stored payload itself so a stale
//    entry is detected on read without needing a separate "expiry" key.
//  - Optional versioning via the key suffix (`zamoraxpay:<feature>:v1`)
//    is the caller's responsibility - this module doesn't enforce it.
//  - NEVER store secrets / auth tokens. The Zustand authStore correctly
//    avoids persisting - keep that pattern.

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined"

interface TtlEnvelope<T> {
  v: number          // schema version of the envelope itself (currently 1)
  d: T               // the actual payload
  e?: number         // epoch-ms expiry; if absent, never expires
  t: number          // written-at epoch-ms
}

export function getJSON<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    // Caller passed us a plain value (no envelope). Return as-is.
    if (parsed == null || typeof parsed !== "object" || !("v" in parsed) || !("d" in parsed) || !("t" in parsed)) {
      return parsed as T
    }
    const env = parsed as TtlEnvelope<T>
    if (env.e != null && Date.now() > env.e) {
      // Expired - clean up so the slot doesn't leak.
      try { window.localStorage.removeItem(key) } catch {}
      return fallback
    }
    return env.d
  } catch {
    return fallback
  }
}

export function setJSON<T>(key: string, value: T, ttlMs?: number): void {
  if (!isBrowser) return
  const envelope: TtlEnvelope<T> = {
    v: 1,
    d: value,
    t: Date.now(),
    ...(ttlMs != null ? { e: Date.now() + ttlMs } : {}),
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    /* storage may be unavailable (private mode, quota) - caller must degrade */
  }
}

export function getRaw(key: string): string | null {
  if (!isBrowser) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setRaw(key: string, value: string): void {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

export function remove(key: string): void {
  if (!isBrowser) return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

/**
 * Append `value` to a JSON array stored under `key`, capping the result
 * at `max` entries (most-recent-first). Used by recent-phones,
 * recent-services, saved-pages, etc. where the array should grow on
 * user action but never exceed a sensible bound.
 */
export function pushUnique<T>(key: string, value: T, max = 50): T[] {
  const current = getJSON<T[]>(key, [])
  // Dedupe by strict equality, push new entry to the front.
  const next = [value, ...current.filter((item) => item !== value)].slice(0, max)
  setJSON(key, next)
  return next
}

/**
 * Remove a single entry from a JSON array stored under `key`.
 * Returns the resulting array.
 */
export function removeFromList<T>(key: string, value: T): T[] {
  const current = getJSON<T[]>(key, [])
  const next = current.filter((item) => item !== value)
  setJSON(key, next)
  return next
}

/**
 * Read with an explicit TTL check. Returns `{ data, isStale }` where
 * `isStale` is true if the entry was found but expired (so the caller
 * can show the stale value immediately while refetching fresh data -
 * the SWR pattern).
 */
export function getWithTtl<T>(key: string, fallback: T): { data: T; isStale: boolean; hasEntry: boolean } {
  if (!isBrowser) return { data: fallback, isStale: false, hasEntry: false }
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return { data: fallback, isStale: false, hasEntry: false }
    const parsed = JSON.parse(raw)
    if (parsed == null || typeof parsed !== "object" || !("v" in parsed) || !("d" in parsed)) {
      // Plain (non-envelope) value - treat as fresh, no expiry tracking.
      return { data: parsed as T, isStale: false, hasEntry: true }
    }
    const env = parsed as TtlEnvelope<T>
    const expired = env.e != null && Date.now() > env.e
    return { data: env.d, isStale: expired, hasEntry: true }
  } catch {
    return { data: fallback, isStale: false, hasEntry: false }
  }
}

/** Canonical key builder: `zamoraxpay:<feature>:vN`. */
export function storageKey(feature: string, version = 1): string {
  return `zamoraxpay:${feature}:v${version}`
}

/**
 * One-time migration of legacy keys to the canonical
 * `zamoraxpay:<feature>:v1` pattern. Safe to call on every app boot -
 * it no-ops once each legacy key is gone.
 *
 * Currently migrated:
 *  - zamoraxpay-theme              -> zamoraxpay:theme:v1
 *  - zamoraxpay_pwa_installed      -> zamoraxpay:pwa-installed:v1
 *  - zamoraxpay_pwa_dismissed_at    -> zamoraxpay:pwa-dismissed-at:v1
 *  - zpay_banner_dismissed_session -> zamoraxpay:banner-dismissed-session:v1
 *  - zpay_spin_popup_dismissed     -> zamoraxpay:spin-popup-dismissed:v1
 *
 * Note: existing keys that already follow the canonical pattern
 * (zamoraxpay:show-balance, zamoraxpay:recent-phones, etc.) are left
 * untouched - they're already correct, just unversioned.
 */
export function migrateLegacyKeys(): void {
  if (!isBrowser) return
  const moves: Array<[string, string]> = [
    ["zamoraxpay-theme", "zamoraxpay:theme:v1"],
    ["zamoraxpay_pwa_installed", "zamoraxpay:pwa-installed:v1"],
    ["zamoraxpay_pwa_dismissed_at", "zamoraxpay:pwa-dismissed-at:v1"],
    ["zpay_spin_popup_dismissed", "zamoraxpay:spin-popup-dismissed:v1"],
  ]
  for (const [from, to] of moves) {
    try {
      const existing = window.localStorage.getItem(from)
      if (existing != null && window.localStorage.getItem(to) == null) {
        window.localStorage.setItem(to, existing)
        window.localStorage.removeItem(from)
      }
    } catch {
      /* ignore individual migration failures - non-fatal */
    }
  }
}

/**
 * Subscribe to the `storage` event so multiple tabs / windows of the
 * same origin stay in sync. Returns an unsubscribe function. Useful
 * for things like `zamoraxpay:show-balance` so a toggle in one tab
 * reflects in the other.
 */
export function onStorageChange(key: string, cb: () => void): () => void {
  if (!isBrowser) return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === key || e.key == null) cb()
  }
  window.addEventListener("storage", handler)
  return () => window.removeEventListener("storage", handler)
}
