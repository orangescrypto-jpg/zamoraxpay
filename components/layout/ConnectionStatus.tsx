"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, WifiOff } from "lucide-react"

export function ConnectionStatus() {
  const [online, setOnline] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)
    const onOnline = () => {
      setOnline(true)
      setVisible(true)
      window.setTimeout(() => setVisible(false), 2200)
    }
    const onOffline = () => {
      setOnline(false)
      setVisible(true)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      className={`fixed inset-x-3 bottom-3 z-[65] mx-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur sm:inset-x-auto sm:right-5 ${
        online ? "border-emerald-200 bg-emerald-50/95 text-emerald-900" : "border-amber-200 bg-amber-50/95 text-amber-950"
      }`}
    >
      {online ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />}
      <div className="min-w-0">
        <p className="font-semibold">{online ? "Back online" : "You're offline"}</p>
        <p className="text-xs opacity-80">{online ? "You can continue using ZamoraxPay." : "Reconnect before starting a transaction."}</p>
      </div>
    </div>
  )
}
