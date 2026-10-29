// hooks/useCachedFetch.ts
// Cache-first fetch hook implementing the SWR pattern requested in the
// audit:
//   1. On mount: read cached value from localStorage (if present) and
//      render it immediately, regardless of TTL.
//   2. In parallel: fetch fresh data from the server.
//   3. If the server response differs from the cache, write the new
//      value back to localStorage and update state.
//   4. If the cache entry is fresh (within TTL) AND the user hasn't
//      manually requested a refresh, skip the network call entirely.
//
// This is the hook that fixes the "5 biggest localStorage gaps" from
// the audit:
//   - dashboard summary
//   - wallet balance
//   - pricing plans
//   - beneficiaries
//   - daily-streak + rewards
//
// Notes:
//  - Auth header is supplied by an optional `authHeader` getter so we
//    don't bake Supabase knowledge into this hook.
//  - The hook NEVER caches POST/PUT/DELETE responses - only GET.
//  - `mutate()` lets callers force a refetch (used after a successful
//    purchase to refresh wallet balance, etc.).

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getWithTtl, remove, setJSON, storageKey } from "@/lib/storage"

export interface CachedFetchOptions<T> {
  /** Storage key. Always passed through storageKey() to get the
   *  canonical `zamoraxpay:<feature>:v1` form. */
  storageKey: string
  /** Schema version for the storage key. Defaults to 1. */
  storageVersion?: number
  /** TTL in ms. While the cache is within TTL, the network is not
   *  hit on mount. Defaults to 30_000 (30s). */
  ttlMs?: number
  /** Async function returning the auth header (e.g. Supabase access
   *  token). Called before each fetch. May throw to abort the call. */
  authHeader?: () => Promise<Record<string, string>>
  /** Optional request init for the fetch call (e.g. custom headers,
   *  cache: 'no-store'). Method is always GET; body is ignored. */
  init?: RequestInit
  /** Skip the network call entirely and serve from cache only.
   *  Useful for offline-first / low-data mode. Defaults to false. */
  cacheOnly?: boolean
  /** When true, do NOT render the cached value while refetching -
   *  instead show the loading state. Useful when the cached value
   *  could be very stale (e.g. wallet balance after a fund action).
   *  Defaults to false (cache-first, like SWR). */
  hideStaleWhileLoading?: boolean
  /** Initial value to use when no cache exists yet. */
  fallback: T
  /** Optional transform applied to the parsed JSON before it lands in
   *  state and in cache. Useful when the API returns a wrapper shape
   *  the UI shouldn't see. */
  transform?: (raw: unknown) => T
}

export interface CachedFetchResult<T> {
  data: T
  loading: boolean
  error: string | null
  /** Force a refetch, bypassing TTL and cache. Returns the new data
   *  (or throws). Useful after mutations. */
  mutate: () => Promise<T>
  /** Drop the cache entry. State resets to fallback. */
  clearCache: () => void
  /** True when the value shown comes from the cache and may be stale
   *  (a network refetch is in progress). Useful for rendering a tiny
   *  "Updating..." hint. */
  isStale: boolean
}

export function useCachedFetch<T>(
  url: string | null,
  options: CachedFetchOptions<T>,
): CachedFetchResult<T> {
  const version = options.storageVersion ?? 1
  const ttlMs = options.ttlMs ?? 30_000
  const resolvedKey = storageKey(options.storageKey, version)

  const [data, setData] = useState<T>(options.fallback)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isStale, setIsStale] = useState<boolean>(false)
  const inFlight = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  // We use a ref to track the "did we hydrate from cache" flag so a
  // re-render triggered by setState doesn't double-fire the network
  // request.
  const hydratedRef = useRef(false)

  // On mount: read cache, render immediately if present.
  useEffect(() => {
    mountedRef.current = true
    const { data: cached, isStale: stale, hasEntry } = getWithTtl<T>(resolvedKey, options.fallback)
    if (hasEntry) {
      setData(cached)
      setIsStale(stale)
    }
    hydratedRef.current = true
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey])

  const doFetch = useCallback(
    async (opts?: { bypassCache?: boolean }): Promise<T> => {
      if (url == null) return options.fallback
      // Within TTL? Skip network entirely unless caller forces.
      if (!opts?.bypassCache && !options.cacheOnly) {
        const { isStale: stale, hasEntry } = getWithTtl<T>(resolvedKey, options.fallback)
        if (hasEntry && !stale) {
          return getWithTtl<T>(resolvedKey, options.fallback).data
        }
      }
      if (options.cacheOnly) {
        // Offline mode: just return whatever we have in cache.
        return getWithTtl<T>(resolvedKey, options.fallback).data
      }

      // Cancel any in-flight request before starting a new one.
      if (inFlight.current) inFlight.current.abort()
      const controller = new AbortController()
      inFlight.current = controller

      if (mountedRef.current) {
        setLoading(true)
        setError(null)
        if (getWithTtl<T>(resolvedKey, options.fallback).hasEntry) {
          setIsStale(true)
        }
      }

      try {
        const headers: Record<string, string> = { Accept: "application/json", ...(options.init?.headers as Record<string, string> | undefined) }
        if (options.authHeader) {
          const auth = await options.authHeader()
          Object.assign(headers, auth)
        }
        const res = await fetch(url, { ...options.init, method: "GET", headers, signal: controller.signal })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const raw = await res.json()
        const transformed = options.transform ? options.transform(raw) : (raw as T)
        if (mountedRef.current) {
          setData(transformed)
          setJSON(resolvedKey, transformed, ttlMs)
          setIsStale(false)
          setLoading(false)
        }
        return transformed
      } catch (err) {
        // If the abort was ours (re-fetch), keep the previous state.
        if ((err as Error)?.name === "AbortError") return data
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Could not load this data. Please try again.")
          setLoading(false)
          setIsStale(false)
        }
        throw err
      } finally {
        if (inFlight.current === controller) inFlight.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, resolvedKey, ttlMs, JSON.stringify(options.init)],
  )

  // Trigger fetch on mount + when URL changes (subject to TTL).
  useEffect(() => {
    if (url == null) return
    void doFetch()
    return () => {
      if (inFlight.current) inFlight.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, resolvedKey])

  // Refetch when the tab regains focus and the cache is stale - common
  // pattern: user opens app, walks away, comes back 10 minutes later.
  // They should see fresh data, not the stale entry from when they left.
  useEffect(() => {
    if (typeof window === "undefined") return
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const { isStale: stale } = getWithTtl<T>(resolvedKey, options.fallback)
        if (stale) void doFetch({ bypassCache: true })
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey])

  const mutate = useCallback(async (): Promise<T> => {
    return doFetch({ bypassCache: true })
  }, [doFetch])

  const clearCache = useCallback(() => {
    remove(resolvedKey)
    setData(options.fallback)
    setIsStale(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey])

  return {
    data: options.hideStaleWhileLoading && loading && isStale ? options.fallback : data,
    loading,
    error,
    mutate,
    clearCache,
    isStale,
  }
}

/**
 * Convenience helper for the most common case: GET an authenticated
 * JSON endpoint using a Supabase access token.
 */
export function useAuthCachedFetch<T>(
  url: string | null,
  options: Omit<CachedFetchOptions<T>, "authHeader">,
): CachedFetchResult<T> {
  // Lazy-load Supabase only when actually needed, to keep this file
  // tree-shakeable for non-authenticated routes.
  const authHeader = useCallback(async () => {
    const { createClient } = await import("@/src/services/providers/supabase/client")
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) {
      throw new Error("Your session has expired. Please sign in again.")
    }
    return { Authorization: `Bearer ${data.session.access_token}` }
  }, [])
  return useCachedFetch<T>(url, { ...options, authHeader })
}
