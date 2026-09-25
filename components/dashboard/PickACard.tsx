// components/dashboard/PickACard.tsx
// Pick-a-card reveal: 4 face-down cards, tap one to flip it. DISPLAY ONLY — the prize
// is decided and saved on the server before this reveals; picking a card just plays
// the flip animation for a result that already exists. The other 3 cards are never
// revealed (no "here's what you missed"), same as a real pick-a-card game.
// Same onSpin/onDone contract as SpinWheel/ScratchCard/MysteryBox so SpinModal can
// swap between them.
"use client"

import { useEffect, useState } from "react"
import type { SpinOutcome } from "@/components/dashboard/useSpinStatus"
import type { WheelSpinResult } from "@/components/dashboard/SpinWheel"

const CARD_COUNT = 4
const FLIP_MS = 500
const REVEAL_DONE_MS = 1800

// Fixed per-slot look so the 4 backs feel like a real deck rather than 4 identical
// rectangles — each has its own suit mark and a slightly different tilt.
const CARD_STYLE = [
  { mark: "♠", rotate: -3 },
  { mark: "♦", rotate: 2 },
  { mark: "♣", rotate: -1 },
  { mark: "♥", rotate: 3 },
]

export function PickACard({
  onSpin,
  onDone,
  disabled,
  buttonLabel = "Deal the cards",
  resetKey,
}: {
  onSpin: () => Promise<WheelSpinResult>
  onDone: (outcome: SpinOutcome) => void
  disabled?: boolean
  buttonLabel?: string
  /** Change this (e.g. to the current ticket id) to reshuffle back to face-down —
   *  otherwise the last reveal stays frozen on screen when a new ticket becomes
   *  available after this one is used. */
  resetKey?: string
}) {
  const [dealt, setDealt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (resetKey === undefined) return
    setDealt(false)
    setLoading(false)
    setPicked(null)
    setFlipped(false)
    setOutcome(null)
    setError(null)
  }, [resetKey])

  async function handleDeal() {
    if (loading || dealt || disabled) return
    setLoading(true)
    setError(null)
    const result = await onSpin()
    setLoading(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setOutcome(result.outcome)
    setDealt(true)
  }

  function handlePick(i: number) {
    if (!dealt || picked !== null || !outcome) return
    setPicked(i)
    setTimeout(() => setFlipped(true), 60)
    setTimeout(() => onDone(outcome), FLIP_MS + REVEAL_DONE_MS)
  }

  const won = outcome && outcome.prizeType !== "nothing"

  return (
    <div className="flex flex-col items-center">
      <div className={`grid grid-cols-4 gap-2.5 ${loading ? "animate-pulse" : ""}`} style={{ width: "min(84vw, 300px)" }}>
        {Array.from({ length: CARD_COUNT }, (_, i) => {
          const isPicked = picked === i
          const showFront = isPicked && flipped
          const style = CARD_STYLE[i % CARD_STYLE.length]
          return (
            <button
              key={i}
              onClick={() => handlePick(i)}
              disabled={!dealt || picked !== null}
              aria-label={`Card ${i + 1}`}
              className="relative aspect-[2/3] [perspective:600px] disabled:cursor-default"
            >
              <div
                className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: showFront ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                {/* Back */}
                <div
                  className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 border-white/20 bg-gradient-to-br from-[#1e3a8a] to-[#0F1E4D] text-2xl text-blue-300/70 shadow-md [backface-visibility:hidden] ${
                    dealt && picked === null ? "hover:scale-105 hover:border-amber-300/60" : ""
                  } ${picked !== null && !isPicked ? "opacity-40" : ""} transition`}
                  style={{ transform: dealt ? `rotate(${style.rotate}deg)` : "none" }}
                >
                  {style.mark}
                </div>
                {/* Front */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-amber-300/60 p-1 text-center shadow-md [backface-visibility:hidden]"
                  style={{
                    transform: "rotateY(180deg)",
                    background: won ? "linear-gradient(135deg,#F59E0B,#DC2626)" : "linear-gradient(135deg,#2563EB,#0F1E4D)",
                  }}
                >
                  {isPicked && (
                    <>
                      <span className="text-xl" aria-hidden="true">{won ? "🎉" : "🍀"}</span>
                      <span className="text-[10px] font-extrabold leading-tight text-white">
                        {won ? outcome!.prizeLabel : "No luck"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {!dealt && (
        <button
          onClick={handleDeal}
          disabled={loading || disabled}
          className="mt-6 inline-flex min-w-[180px] items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-8 py-3 text-base font-extrabold tracking-wide text-white shadow-lg shadow-orange-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Dealing…" : buttonLabel}
        </button>
      )}
      {dealt && picked === null && <p className="mt-4 text-center text-xs text-blue-100">Pick a card to reveal your prize</p>}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
