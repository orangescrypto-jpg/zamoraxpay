// components/layout/ConnectionStatus.tsx
// Shows a transient banner when network state changes:
//   - offline -> "You're offline" (amber)
//   - back online -> "Back online" (emerald, auto-dismiss 2.2s)
//   - slow network detected (2g/3g or saveData flag) -> "Slow network"
//     (amber, dismissible) - new in this round. Uses the Network
//     Information API where available (Chrome, Edge). Silently no-ops
//     on browsers without navigator.connection (Safari, Firefox).

"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, WifiOff, Gauge, X } from "lucide-react"

interface NetworkInformation {
  effectiveType?: string
  saveData?: boolean
  addEventListener?: (type: "change", listener: () => void) => void
  removeEventListener?: (type: "change", listener: () => void) => void
}

type Banner = "offline" | "online" | "slow" | null

export function ConnectionStatus() {
  const [banner, setBanner] = useState<Banner>(null)
  const [autoDismissTimer, setAutoDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  function show(b: Banner, autoHideMs?: number) {
    setBanner(b)
    if (autoDismissTimer) clearTimeout(autoDismissTimer)
    if (autoHideMs != null) {
      const t = setTimeout(() => setBanner(null), autoHideMs)
      setAutoDismissTimer(t)
    }
  }

  useEffect(() => {
    function isSlowNetwork(): boolean {
      const conn = (navigator as unknown as { connection?: NetworkInformation }).connection
      if (!conn) return false
      if (conn.saveData) return true
      const effective = conn.effectiveType ?? ""
      return effective === "2g" || effective === "slow-2g" || effective === "3g"
    }

    // Initial state
    if (!navigator.onLine) {
      show("offline")
    } else if (isSlowNetwork()) {
      show("slow")
    }

    const onOnline = () => show("online", 2200)
    const onOffline = () => show("offline")

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    // Network Information API change listener - fires when effectiveType
    // changes (e.g. user moves from 4G to 2G).
    const conn = (navigator as unknown as { connection?: NetworkInformation }).connection
    const onConnChange = () => {
      if (!navigator.onLine) return
      if (isSlowNetwork()) show("slow")
    }
    conn?.addEventListener?.("change", onConnChange)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      conn?.removeEventListener?.("change", onConnChange)
      if (autoDismissTimer) clearTimeout(autoDismissTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (banner === null) return null

  const offline = banner === "offline"
  const online = banner === "online"
  const slow = banner === "slow"

  return (
    <div
      role="status"
      className={`fixed inset-x-3 bottom-3 z-[65] mx-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur sm:inset-x-auto sm:right-5 ${
        online ? "border-emerald-200 bg-emerald-50/95 text-emerald-900" : "border-amber-200 bg-amber-50/95 text-amber-950"
      }`}
    >
      {online ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : offline ? (
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <Gauge className="h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {online ? "Back online" : offline ? "You're offline" : "Slow network detected"}
        </p>
        <p className="text-xs opacity-80">
          {online
            ? "You can continue using ZamoraxPay."
            : offline
              ? "Reconnect before starting a transaction."
              : "Things may take longer than usual. You can enable Low-data mode in Page tools."}
        </p>
      </div>
      {/* Only the slow-network banner is dismissible - online/offline
          should be authoritative and auto-clear when state changes. */}
      {slow && (
        <button
          type="button"
          aria-label="Dismiss slow network notice"
          onClick={() => setBanner(null)}
          className="shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
