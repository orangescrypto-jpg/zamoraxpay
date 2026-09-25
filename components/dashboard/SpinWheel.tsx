// components/dashboard/SpinWheel.tsx
// The wheel. It is DISPLAY ONLY: the prize is decided and saved on the server before
// this animates, so the animation just lands on a result that already exists.
"use client"

import { useEffect, useRef, useState } from "react"
import type { SpinOutcome, WheelSegment } from "@/components/dashboard/useSpinStatus"

const PALETTE = ["#0F1E4D", "#2563EB", "#7C3AED", "#0891B2", "#059669", "#D97706", "#DC2626", "#DB2777"]
const SIZE = 300
const C = SIZE / 2
const R = 140
const SPIN_MS = 4200

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: C + radius * Math.sin(a), y: C - radius * Math.cos(a) }
}

function segmentPath(i: number, n: number) {
  const seg = 360 / n
  const a0 = i * seg
  const a1 = (i + 1) * seg
  const p0 = polar(a0, R)
  const p1 = polar(a1, R)
  return `M ${C} ${C} L ${p0.x} ${p0.y} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${p1.x} ${p1.y} Z`
}

function fillFor(s: WheelSegment, i: number) {
  if (s.type === "nothing") return "#94A3B8"
  if (s.isJackpot) return "#F59E0B"
  return s.color || PALETTE[i % PALETTE.length]
}

function shortLabel(label: string) {
  return label.length > 13 ? `${label.slice(0, 12)}…` : label
}

export type WheelSpinResult = { ok: true; outcome: SpinOutcome } | { ok: false; message: string }

export function SpinWheel({
  segments,
  onSpin,
  onDone,
  disabled,
  buttonLabel = "SPIN",
}: {
  segments: WheelSegment[]
  onSpin: () => Promise<WheelSpinResult>
  onDone: (outcome: SpinOutcome) => void
  disabled?: boolean
  buttonLabel?: string
}) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  // True only for the network round-trip before the server has told us the
  // result, so the wheel visibly does SOMETHING right away instead of
  // sitting frozen while the button just says "Spinning…" underneath it —
  // that dead-looking wait is what reads as the game being stuck.
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rotationRef = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const n = segments.length

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function handleSpin() {
    if (spinning || waiting || disabled) return
    setWaiting(true)
    setError(null)

    const result = await onSpin()
    setWaiting(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSpinning(true)
    const outcome = result.outcome

    // Fewer than 2 slices can't be drawn as a wheel: just reveal the result.
    if (n < 2) {
      setSpinning(false)
      onDone(outcome)
      return
    }

    let index = segments.findIndex((s) => s.id === outcome.prizeId)
    if (index < 0) index = segments.findIndex((s) => s.type === "nothing")
    if (index < 0) index = Math.floor(Math.random() * n)

    const seg = 360 / n
    // Rotate so the middle of slice `index` ends up under the pointer at the top.
    const target = 360 - (index + 0.5) * seg
    const current = rotationRef.current
    const delta = (target - (current % 360) + 360) % 360
    // A little wobble inside the slice so it doesn't always stop dead-centre.
    const jitter = (Math.random() - 0.5) * seg * 0.6
    const next = current + 360 * 6 + delta + jitter

    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    rotationRef.current = next
    setRotation(next)
    timer.current = setTimeout(
      () => {
        setSpinning(false)
        onDone(outcome)
      },
      reduced ? 500 : SPIN_MS + 100,
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative transition-opacity ${waiting ? "animate-pulse opacity-80" : ""}`}
        style={{ width: "min(78vw, 300px)", aspectRatio: "1 / 1" }}
      >
        {/* pointer */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
          style={{ width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "22px solid #DC2626", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }}
          aria-hidden="true"
        />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full drop-shadow-lg"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.62, 0.08, 1)` : "none",
          }}
          role="img"
          aria-label="Prize wheel"
        >
          <circle cx={C} cy={C} r={R + 6} fill="#0F1E4D" />
          {n >= 2 ? (
            segments.map((s, i) => {
              const mid = (i + 0.5) * (360 / n)
              const flip = mid > 180
              const tr = polar(0, 0.62 * R) // anchor above centre; the group rotation places it
              return (
                <g key={s.id}>
                  <path d={segmentPath(i, n)} fill={fillFor(s, i)} stroke="#fff" strokeWidth={2} />
                  <text
                    x={C}
                    y={C - 0.62 * R}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize={n > 8 ? 10 : 12}
                    fontWeight={700}
                    transform={`rotate(${mid} ${C} ${C}) rotate(${flip ? 90 : -90} ${tr.x} ${tr.y})`}
                  >
                    {shortLabel(s.label)}
                  </text>
                </g>
              )
            })
          ) : (
            <circle cx={C} cy={C} r={R} fill="#2563EB" />
          )}
          <circle cx={C} cy={C} r={26} fill="#fff" stroke="#0F1E4D" strokeWidth={4} />
        </svg>
        {waiting && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          </div>
        )}
      </div>

      <button
        onClick={handleSpin}
        disabled={spinning || waiting || disabled}
        className="mt-6 inline-flex min-w-[180px] items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-8 py-3 text-base font-extrabold tracking-wide text-white shadow-lg shadow-orange-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {waiting ? "Contacting server…" : spinning ? "Spinning…" : buttonLabel}
      </button>
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
