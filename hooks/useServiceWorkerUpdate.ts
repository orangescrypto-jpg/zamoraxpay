// hooks/useServiceWorkerUpdate.ts
// Listens for service-worker updates and exposes a boolean + reload
// callback so the app can show a "New version available, reload to
// update" toast. No external SW library needed - this is plain
// navigator.serviceWorker API.
//
// Behaviour:
//  - On mount: registers a controllerchange listener.
//  - When a new SW takes over, sets `updateReady = true`.
//  - The caller shows a toast/banner; when the user clicks "Reload",
//    call `applyUpdate()` which does `window.location.reload()`.
//
// We avoid auto-reloading because a reload mid-purchase is bad UX.
// The user explicitly opts in.

"use client"

import { useEffect, useState } from "react"

export function useServiceWorkerUpdate(): {
  updateReady: boolean
  applying: boolean
  applyUpdate: () => void
  dismiss: () => void
} {
  const [updateReady, setUpdateReady] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    let refreshing = false

    // The controllerchange event fires when a new SW takes control.
    // We only care about the post-update case (not the initial
    // registration), so we check navigator.serviceWorker.controller.
    function onControllerChange() {
      if (refreshing) return
      refreshing = true
      // A new SW has activated. Tell the UI to show "reload to update".
      setUpdateReady(true)
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    // Also poll for updates every 5 minutes - the SW itself calls
    // reg.update() on page load, but a long-lived tab won't pick up
    // a new SW without polling.
    // CPU FIX: only poll for SW updates while the tab is visible — a
    // backgrounded tab kept hitting serviceWorker.getRegistration every
    // 5 minutes for nothing, and reg.update() is a network call.
    const pollForUpdate = () => {
      navigator.serviceWorker?.getRegistration?.("/sw.js")?.then?.((reg) => {
        reg?.update?.().catch(() => {})
      }).catch(() => {})
    }
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") pollForUpdate()
    }, 5 * 60 * 1000)
    const onVisible = () => {
      // Catch up immediately on return: the tab may have been hidden
      // across several scheduled polls.
      if (document.visibilityState === "visible") pollForUpdate()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(pollInterval)
    }
  }, [])

  function applyUpdate() {
    setApplying(true)
    // Give the browser a tick to flush any pending state, then reload.
    setTimeout(() => {
      window.location.reload()
    }, 50)
  }

  function dismiss() {
    setUpdateReady(false)
  }

  return { updateReady, applying, applyUpdate, dismiss }
}
