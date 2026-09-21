// components/dashboard/SpinModal.tsx
// The spin dialog used by BOTH the dashboard popup and the inline card.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { SpinWheel, type WheelSpinResult } from "@/components/dashboard/SpinWheel"
import { spinAuthHeaders, timeLeft, type SpinApi, type SpinOutcome } from "@/components/dashboard/useSpinStatus"

export function SpinModal({ open, onClose, spin }: { open: boolean; onClose: () => void; spin: SpinApi }) {
  const [result, setResult] = useState<SpinOutcome | null>(null)
  const [, setTick] = useState(0)
  const { status, refresh } = spin

  // keep the "expires in" text fresh
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [open])

  useEffect(() => {
    if (!open) setResult(null)
  }, [open])

  if (!open || !status?.enabled) return null

  const ticket = status.tickets[0]
  const segments = ticket ? status.wheels[ticket.sourceKey] ?? [] : []

  async function doSpin(): Promise<WheelSpinResult> {
    if (!ticket) return { ok: false, message: "You don't have a spin right now." }
    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { ...(await spinAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) return { ok: false, message: json.message ?? "Couldn't spin. Please try again." }
      return { ok: true, outcome: json as SpinOutcome }
    } catch {
      return { ok: false, message: "Network problem. Your spin is safe — please try again." }
    }
  }

  async function handleDone(outcome: SpinOutcome) {
    setResult(outcome)
    await refresh() // update tickets left, and the card behind the modal
  }

  const won = result && result.prizeType !== "nothing"
  const remaining = status.tickets.length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#0F1E4D] to-[#1e3a8a] p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <X className="h-4 w-4" />
        </button>

        {!result ? (
          <>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-amber-300">Spin &amp; Win</p>
            <h2 className="mt-1 text-center text-xl font-bold">
              {remaining > 1 ? `You have ${remaining} spins!` : "You've got a spin!"}
            </h2>
            {ticket && (
              <p className="mt-1 text-center text-xs text-blue-100">
                {ticket.sourceLabel} · expires in {timeLeft(ticket.expiresAt)}
              </p>
            )}
            <div className="mt-6">
              {ticket ? (
                <SpinWheel segments={segments} onSpin={doSpin} onDone={handleDone} disabled={!ticket} />
              ) : (
                <p className="py-10 text-center text-sm text-blue-100">No spins available right now.</p>
              )}
            </div>
            {status.spinsLeftToday !== null && (
              <p className="mt-4 text-center text-[11px] text-blue-200/80">{status.spinsLeftToday} spin{status.spinsLeftToday === 1 ? "" : "s"} left today</p>
            )}
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="text-6xl" aria-hidden="true">{won ? "🎉" : "🍀"}</div>
            <h2 className="mt-3 text-2xl font-extrabold">{won ? "You won!" : "Not this time"}</h2>
            {won && <p className="mt-1 text-lg font-bold text-amber-300">{result.prizeLabel}</p>}
            <p className="mt-3 text-sm text-blue-100">{result.message}</p>
            {result.wasGuarantee && <p className="mt-2 text-xs text-amber-200">Lucky-streak bonus 🍀</p>}

            <div className="mt-6 flex flex-col gap-2">
              {result.ticketsLeft > 0 && (
                <button
                  onClick={() => setResult(null)}
                  className="rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-6 py-3 text-sm font-extrabold text-white shadow-lg"
                >
                  Spin again ({result.ticketsLeft} left)
                </button>
              )}
              {won && (result.prizeType === "airtime_voucher" || result.prizeType === "data_voucher") && (
                <Link href="/spin" onClick={onClose} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-[#0F1E4D]">
                  Claim my prize
                </Link>
              )}
              <button onClick={onClose} className="rounded-full bg-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/25">
                {result.ticketsLeft > 0 ? "Later" : "Done"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
