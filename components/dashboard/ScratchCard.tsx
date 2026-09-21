// components/dashboard/ScratchCard.tsx
// Scratch-to-reveal card. DISPLAY ONLY: the prize is decided and saved on the server
// before this reveals — scratching just uncovers a result that already exists.
// Same onSpin/onDone contract as SpinWheel so SpinModal can swap between them.
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SpinOutcome } from "@/components/dashboard/useSpinStatus"
import type { WheelSpinResult } from "@/components/dashboard/SpinWheel"

const SIZE = 280
const SCRATCH_RADIUS = 22
const REVEAL_THRESHOLD = 0.55 // fraction of the canvas cleared before we auto-reveal

export function ScratchCard({
  onSpin,
  onDone,
  disabled,
  buttonLabel = "Get my card",
}: {
  onSpin: () => Promise<WheelSpinResult>
  onDone: (outcome: SpinOutcome) => void
  disabled?: boolean
  buttonLabel?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  const [scratching, setScratching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null)
  const clearedRef = useRef(0)
  const doneRef = useRef(false)
  const pointerDownRef = useRef(false)

  const drawCoating = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = SIZE
    canvas.height = SIZE
    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE)
    grad.addColorStop(0, "#94A3B8")
    grad.addColorStop(1, "#64748B")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.font = "bold 15px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("Scratch here", SIZE / 2, SIZE / 2)
    clearedRef.current = 0
    setDrawn(true)
  }, [])

  useEffect(() => {
    drawCoating()
  }, [drawCoating])

  function scratchAt(x: number, y: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE }
  }

  function checkCleared() {
    const canvas = canvasRef.current
    if (!canvas || doneRef.current) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Sample every 6th pixel for performance.
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data
    let transparent = 0
    let sampled = 0
    for (let i = 3; i < data.length; i += 4 * 6) {
      sampled++
      if (data[i] < 20) transparent++
    }
    clearedRef.current = transparent / Math.max(1, sampled)
    if (clearedRef.current >= REVEAL_THRESHOLD && outcome) {
      doneRef.current = true
      const canvas2 = canvasRef.current
      if (canvas2) {
        const ctx2 = canvas2.getContext("2d")
        ctx2?.clearRect(0, 0, SIZE, SIZE)
      }
      setTimeout(() => onDone(outcome), 350)
    }
  }

  async function handleGetCard() {
    if (scratching || disabled) return
    setScratching(true)
    setError(null)
    const result = await onSpin()
    if (!result.ok) {
      setScratching(false)
      setError(result.message)
      return
    }
    setOutcome(result.outcome)
    drawCoating()
    doneRef.current = false
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!outcome) return
    pointerDownRef.current = true
    const { x, y } = pointerPos(e)
    scratchAt(x, y)
    checkCleared()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerDownRef.current || !outcome) return
    const { x, y } = pointerPos(e)
    scratchAt(x, y)
    checkCleared()
  }

  function handlePointerUp() {
    pointerDownRef.current = false
  }

  const won = outcome && outcome.prizeType !== "nothing"

  return (
    <div className="flex flex-col items-center">
      <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ width: "min(78vw, 280px)", aspectRatio: "1 / 1" }}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl px-4 text-center"
          style={{ background: won ? "linear-gradient(135deg,#F59E0B,#DC2626)" : "linear-gradient(135deg,#2563EB,#0F1E4D)" }}
        >
          {outcome ? (
            <>
              <span className="text-4xl" aria-hidden="true">{won ? "🎉" : "🍀"}</span>
              <span className="text-lg font-extrabold text-white">{won ? outcome.prizeLabel : "Better luck next time"}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-white/80">Tap &quot;{buttonLabel}&quot; to start</span>
          )}
        </div>
        {drawn && outcome && (
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="absolute inset-0 h-full w-full touch-none rounded-2xl"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        )}
      </div>

      {!outcome && (
        <button
          onClick={handleGetCard}
          disabled={scratching || disabled}
          className="mt-6 inline-flex min-w-[180px] items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-8 py-3 text-base font-extrabold tracking-wide text-white shadow-lg shadow-orange-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {scratching ? "Loading…" : buttonLabel}
        </button>
      )}
      {outcome && <p className="mt-4 text-center text-xs text-blue-100">Scratch the card to reveal your prize</p>}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
