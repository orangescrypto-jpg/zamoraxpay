// components/dashboard/MysteryBox.tsx
// Tap-to-open mystery box. DISPLAY ONLY: the prize is decided and saved on the server
// before this opens - tapping just plays the reveal animation for a result that
// already exists. Same onSpin/onDone contract as SpinWheel so SpinModal can swap it in.
//
// Upgrade: previously this was just an emoji (🎁) with `animate-bounce`. That
// was visually inconsistent with the premium ScratchCard next to it. Now it
// renders a real SVG gift box with a glow + lid-lift animation that matches
// the polish of the rest of the gamification layer.
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
   *  unopened - otherwise the last reveal stays frozen on screen when a
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
    // Haptic feedback: short double-pulse to signal "box is opening".
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([20, 40, 30])
      }
    } catch { /* non-fatal */ }
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
        {/* Glow ring behind the box - subtle when idle, brighter when opening */}
        <div
          className={`pointer-events-none absolute inset-0 rounded-full transition-all duration-500 ${
            opening
              ? "bg-amber-400/40 blur-2xl scale-110"
              : opened
                ? "bg-emerald-400/30 blur-2xl scale-100"
                : "bg-amber-500/10 blur-xl scale-95"
          }`}
          aria-hidden="true"
        />

        {!opened && (
          <svg
            viewBox="0 0 200 200"
            className={`relative h-full w-full transition-all duration-500 ${opening ? "scale-110" : "scale-100"}`}
            style={{ filter: "drop-shadow(0 20px 30px rgba(11, 18, 32, 0.35))" }}
            aria-hidden="true"
          >
            {/* Box base */}
            <defs>
              <linearGradient id="mysteryBoxBody" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <linearGradient id="mysteryBoxLid" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FCD34D" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
              <linearGradient id="mysteryBoxRibbon" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#DC2626" />
                <stop offset="100%" stopColor="#991B1B" />
              </linearGradient>
            </defs>

            {/* Box body (the cube part below the lid) */}
            <rect
              x="40" y="100" width="120" height="75" rx="6"
              fill="url(#mysteryBoxBody)"
              stroke="#92400E" strokeWidth="1.5"
            />
            {/* Vertical ribbon */}
            <rect x="92" y="100" width="16" height="75" fill="url(#mysteryBoxRibbon)" />
            {/* Lid (lifts up when opening) */}
            <g
              className="origin-center"
              style={{
                transformOrigin: "100px 100px",
                transform: opening ? "translateY(-18px) scale(1.05)" : "translateY(0) scale(1)",
                transition: "transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <rect x="32" y="80" width="136" height="28" rx="4" fill="url(#mysteryBoxLid)" stroke="#92400E" strokeWidth="1.5" />
              {/* Ribbon bow on top */}
              <ellipse cx="80" cy="75" rx="14" ry="10" fill="url(#mysteryBoxRibbon)" />
              <ellipse cx="120" cy="75" rx="14" ry="10" fill="url(#mysteryBoxRibbon)" />
              <circle cx="100" cy="75" r="6" fill="#DC2626" />
              <rect x="96" y="80" width="8" height="22" fill="url(#mysteryBoxRibbon)" />
            </g>
            {/* Question mark badge in the center of the body */}
            <circle cx="100" cy="138" r="14" fill="#FFFFFF" opacity="0.95" />
            <text
              x="100" y="146"
              textAnchor="middle"
              fontSize="22"
              fontWeight="700"
              fill="#B45309"
              fontFamily="Inter, sans-serif"
            >
              ?
            </text>
          </svg>
        )}

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
          {opening ? "Opening..." : buttonLabel}
        </button>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
