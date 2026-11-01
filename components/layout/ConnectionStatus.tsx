// components/layout/ConnectionStatus.tsx
// Shows a transient banner when network state changes:
//   - offline -> "You're offline" (amber)
//   - back online -> "Back online" (emerald, auto-dismiss 2.2s)
// The "slow network detected" toast was removed - it collided with the
// PWA install banner at the bottom of the screen and added friction
// without much value.

"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, WifiOff } from "lucide-react"

type Banner = "offline" | "online" | null

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
    // Initial state
    if (!navigator.onLine) {
      show("offline")
    }

    const onOnline = () => show("online", 2200)
    const onOffline = () => show("offline")

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      if (autoDismissTimer) clearTimeout(autoDismissTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (banner === null) return null

  const offline = banner === "offline"
  const online = banner === "online"

  return (
    <div
      role="status"
      // Sits just above the mobile bottom nav instead of on top of it
      // (it used to be bottom-3, which sat directly over the nav bar and
      // hid its icons/labels). z-[70] keeps it above the .zpx-local-tools
      // / .zpx-back-to-top FABs (z-index 150/160) only while this toast
      // is visible — it's transient, so briefly covering a FAB corner is
      // fine, but it must never be covered BY the nav bar it's warning
      // about. On >=sm screens there's no bottom nav, so it sits near
      // the corner as before.
      className={`fixed inset-x-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur bottom-[calc(3.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-5 sm:right-5 ${
        online ? "border-emerald-200 bg-emerald-50/95 text-emerald-900" : "border-amber-200 bg-amber-50/95 text-amber-950"
      }`}
    >
      {online ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{online ? "Back online" : "You're offline"}</p>
        <p className="text-xs opacity-80">
          {online ? "You can continue using ZamoraxPay." : "Reconnect before starting a transaction."}
        </p>
      </div>
    </div>
  )
}
