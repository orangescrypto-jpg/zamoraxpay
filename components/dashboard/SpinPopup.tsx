// components/dashboard/SpinPopup.tsx
// Opens the spin dialog straight away when the user lands on the dashboard with a ticket.
//  - Admin can switch the popup off (Spin → Settings); the inline card still shows.
//  - It waits for the announcement popup: `blocked` stays true until that one is closed,
//    so the two never stack.
//  - Closing it dismisses it for this browser session only; the inline card remains.
"use client"

import { useEffect, useState } from "react"
import { SpinModal } from "@/components/dashboard/SpinModal"
import type { SpinApi } from "@/components/dashboard/useSpinStatus"

const KEY = "zpay_spin_popup_dismissed"

export function SpinPopup({ spin, blocked }: { spin: SpinApi; blocked: boolean }) {
  const { status } = spin
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(true) // assume dismissed until we've read sessionStorage

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(KEY) === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const shouldShow = !blocked && !dismissed && !!status?.enabled && status.popupEnabled && status.tickets.length > 0

  useEffect(() => {
    if (shouldShow) setOpen(true)
  }, [shouldShow])

  function close() {
    setOpen(false)
    setDismissed(true)
    try {
      sessionStorage.setItem(KEY, "1")
    } catch {
      /* private mode — fine */
    }
  }

  return <SpinModal open={open} onClose={close} spin={spin} />
}
