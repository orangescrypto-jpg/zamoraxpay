// hooks/useLocalStorage.ts
// React-friendly wrappers around lib/storage.ts. These are the only
// hooks new code should use for client-side persistence; legacy files
// that already use localStorage directly continue to work, but new
// features should adopt these for SSR-safety, TTL support, and
// cross-tab sync.

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getJSON, getWithTtl, onStorageChange, remove, setJSON, storageKey } from "@/lib/storage"

/**
 * useLocalStorage<T>
 *
 * Cache-first state backed by localStorage. Returns the same shape as
 * useState, plus a `remove` function. Optional TTL is supported.
 *
 * Read pattern: SSR-safe (returns fallback on server); re-reads in
 * useEffect to pick up the client-side value (avoids hydration mismatch
 * warnings because the first client render matches the server render).
 *
 * Cross-tab sync: optional `syncAcrossTabs` flag (default true) wires the
 * `storage` event so other tabs see changes immediately.
 */
export function useLocalStorage<T>(
  key: string,
  fallback: T,
  options?: { ttlMs?: number; syncAcrossTabs?: boolean; version?: number },
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const ttlMs = options?.ttlMs
  const sync = options?.syncAcrossTabs !== false
  const resolvedKey = options?.version != null ? storageKey(key.replace(/^zamoraxpay:/, "").replace(/:v\d+$/, ""), options.version) : key

  const [value, setValue] = useState<T>(fallback)
  const [hydrated, setHydrated] = useState(false)

  // Initial read on mount (client-side only, after hydration).
  useEffect(() => {
    if (ttlMs != null) {
      const { data } = getWithTtl<T>(resolvedKey, fallback)
      setValue(data)
    } else {
      setValue(getJSON<T>(resolvedKey, fallback))
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey])

  // Cross-tab sync via the storage event.
  useEffect(() => {
    if (!sync) return
    return onStorageChange(resolvedKey, () => {
      if (ttlMs != null) {
        const { data } = getWithTtl<T>(resolvedKey, fallback)
        setValue(data)
      } else {
        setValue(getJSON<T>(resolvedKey, fallback))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, sync, ttlMs])

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next
        setJSON(resolvedKey, resolved, ttlMs)
        return resolved
      })
    },
    [resolvedKey, ttlMs],
  )

  const clear = useCallback(() => {
    remove(resolvedKey)
    setValue(fallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey])

  return [hydrated ? value : fallback, update, clear]
}
