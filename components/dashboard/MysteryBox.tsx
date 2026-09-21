// components/dashboard/MysteryBox.tsx
// Tap-to-open mystery box. DISPLAY ONLY: the prize is decided and saved on the server
// before this opens — tapping just plays the reveal animation for a result that
// already exists. Same onSpin/onDone contract as SpinWheel so SpinModal can swap it in.
"use client"

import { useEffect, useState } from "react"
import type { SpinOutcome } from "@/components/dashboard/useSpinStatus"
import type { WheelSpinResult } from "@/components/dashboard/SpinWheel"

const OPEN_MS = 900

export function MysteryBox({
  onSpin,
  onDone,
  disabled,
  buttonLabel = "Open the box",
  resetKey,
}: {
  onSpin: () => Promise<WheelSpinResult>
  onDone: (outcome: SpinOutcome) => void
  disabled?: boolean
  buttonLabel?: string
  /** Change this (e.g. to the current ticket id) to reset the box back to
   *  unopened — otherwise the last reveal stays frozen on screen when a
   *  new ticket becomes available after this one is used. */
  resetKey?: string
}) {
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(false)
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (resetKey === undefined) return
    setOpening(false)
    setOpened(false)
    setOutcome(null)
    setError(null)
  }, [resetKey])

  async function handleOpen() {
    if (opening || opened || disabled) return
    setOpening(true)
    setError(null)
    const result = await onSpin()
    if (!result.ok) {
      setOpening(false)
      setError(result.message)
      return
    }
    setOutcome(result.outcome)
    setTimeout(() => {
      setOpened(true)
      setOpening(false)
    }, OPEN_MS)
    setTimeout(() => onDone(result.outcome), OPEN_MS + 700)
  }

  const won = outcome && outcome.prizeType !== "nothing"

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: "min(70vw, 240px)", aspectRatio: "1 / 1" }}>
        <div
          className={`text-8xl transition-all duration-500 ${opening ? "scale-125 animate-bounce" : ""} ${opened ? "scale-0 opacity-0" : ""}`}
          aria-hidden="true"
        >
          🎁
        </div>
        {opened && outcome && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <span className="text-5xl" aria-hidden="true">{won ? "🎉" : "🍀"}</span>
            <span className="mt-1 text-lg font-extrabold text-white">{won ? outcome.prizeLabel : "Better luck next time"}</span>
          </div>
        )}
      </div>

      {!opened && (
        <button
          onClick={handleOpen}
          disabled={opening || disabled}
          className="mt-6 inline-flex min-w-[180px] items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-8 py-3 text-base font-extrabold tracking-wide text-white shadow-lg shadow-orange-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {opening ? "Opening…" : buttonLabel}
        </button>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
