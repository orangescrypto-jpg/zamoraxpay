// components/dashboard/ScratchCard.tsx
// Scratch-to-reveal card. DISPLAY ONLY: the prize is decided and saved on the server
// before this reveals — scratching just uncovers a result that already exists.
// Same onSpin/onDone contract as SpinWheel so SpinModal can swap between them.
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SpinOutcome } from "@/components/dashboard/useSpinStatus"
import type { WheelSpinResult } from "@/components/dashboard/SpinWheel"

const SIZE = 280
const SCRATCH_RADIUS = 24
const REVEAL_THRESHOLD = 0.55 // fraction of the canvas cleared before we auto-reveal
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1

type Particle = { x: number; y: number; vx: number; vy: number; life: number; hue: number; size: number }

// Draws a brushed-foil coating: a metallic diagonal sheen plus a fine scratch-etched
// texture, so the "before" state reads as an actual physical card instead of a flat tint.
function paintFoil(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  g.addColorStop(0, "#B9C4D6")
  g.addColorStop(0.35, "#8A97AE")
  g.addColorStop(0.55, "#DCE3EE")
  g.addColorStop(0.75, "#6B7A93")
  g.addColorStop(1, "#4B5A73")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Fine diagonal etching for a brushed-metal look.
  ctx.strokeStyle = "rgba(255,255,255,0.10)"
  ctx.lineWidth = 1
  for (let i = -SIZE; i < SIZE * 2; i += 5) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i - SIZE, SIZE)
    ctx.stroke()
  }

  // Soft vignette so the coating doesn't look pasted flat.
  const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.2, SIZE / 2, SIZE / 2, SIZE * 0.75)
  vg.addColorStop(0, "rgba(0,0,0,0)")
  vg.addColorStop(1, "rgba(0,0,0,0.18)")
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Coin/star mark repeated lightly, like real scratch-card stock.
  ctx.fillStyle = "rgba(255,255,255,0.14)"
  ctx.font = "bold 13px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (let y = 22; y < SIZE; y += 46) {
    for (let x = 22 + ((y / 46) % 2) * 23; x < SIZE; x += 46) {
      ctx.fillText("★", x, y)
    }
  }

  ctx.fillStyle = "rgba(15,30,77,0.55)"
  ctx.beginPath()
  const cx = SIZE / 2
  const cy = SIZE / 2
  ctx.roundRect(cx - 78, cy - 20, 156, 40, 20)
  ctx.fill()
  ctx.fillStyle = "#fff"
  ctx.font = "bold 14px sans-serif"
  ctx.fillText("SCRATCH HERE", cx, cy)
}

export function ScratchCard({
  onSpin,
  onDone,
  disabled,
  buttonLabel = "Get my card",
  resetKey,
}: {
  onSpin: () => Promise<WheelSpinResult>
  onDone: (outcome: SpinOutcome) => void
  disabled?: boolean
  buttonLabel?: string
  /** Change this (e.g. to the current ticket id) to reset the card back to
   *  unscratched — otherwise the last reveal stays frozen on screen when a
   *  new ticket becomes available after this one is used. */
  resetKey?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [scratching, setScratching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null)
  const [progress, setProgress] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const clearedRef = useRef(0)
  const doneRef = useRef(false)
  const pointerDownRef = useRef(false)

  const drawCoating = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = SIZE * DPR
    canvas.height = SIZE * DPR
    canvas.style.width = `${SIZE}px`
    canvas.style.height = `${SIZE}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    paintFoil(ctx)
    clearedRef.current = 0
    setProgress(0)
    setDrawn(true)
  }, [])

  useEffect(() => {
    drawCoating()
  }, [drawCoating])

  useEffect(() => {
    if (resetKey === undefined) return
    setOutcome(null)
    setScratching(false)
    setError(null)
    setCelebrate(false)
    doneRef.current = false
    drawCoating()
  }, [resetKey, drawCoating])

  // Lightweight particle burst that follows the scratch point, for a "flaking foil" feel.
  const spawnParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.6 + Math.random() * 1.4
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: 1,
        hue: 210 + Math.random() * 20,
        size: 1.5 + Math.random() * 2,
      })
    }
    if (particlesRef.current.length > 160) particlesRef.current.splice(0, particlesRef.current.length - 160)
  }, [])

  const runParticleLoop = useCallback(() => {
    const fx = fxRef.current
    const ctx = fx?.getContext("2d")
    if (!fx || !ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    particlesRef.current = particlesRef.current.filter((p) => p.life > 0)
    for (const p of particlesRef.current) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.06
      p.life -= 0.035
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = `hsl(${p.hue} 60% 85%)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    if (particlesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame(runParticleLoop)
    } else {
      rafRef.current = null
    }
  }, [])

  useEffect(() => {
    const fx = fxRef.current
    if (fx) {
      fx.width = SIZE * DPR
      fx.height = SIZE * DPR
      fx.style.width = `${SIZE}px`
      fx.style.height = `${SIZE}px`
      fx.getContext("2d")?.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function scratchAt(x: number, y: number) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    spawnParticles(x, y)
    if (!rafRef.current) rafRef.current = requestAnimationFrame(runParticleLoop)
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
    const data = ctx.getImageData(0, 0, SIZE * DPR, SIZE * DPR).data
    let transparent = 0
    let sampled = 0
    for (let i = 3; i < data.length; i += 4 * 6) {
      sampled++
      if (data[i] < 20) transparent++
    }
    clearedRef.current = transparent / Math.max(1, sampled)
    setProgress(Math.min(1, clearedRef.current / REVEAL_THRESHOLD))
    if (clearedRef.current >= REVEAL_THRESHOLD && outcome) {
      doneRef.current = true
      ctx.clearRect(0, 0, SIZE * DPR, SIZE * DPR)
      if (outcome.prizeType !== "nothing") setCelebrate(true)
      // Dwell on the reveal long enough to actually read it before this
      // component resets itself for the next ticket (see resetKey below) —
      // there's no longer a separate "Try again" screen holding it up.
      setTimeout(() => onDone(outcome), 1800)
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
  const pct = Math.round(progress * 100)

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/10"
        style={{ width: "min(78vw, 280px)", aspectRatio: "1 / 1" }}
      >
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl px-4 text-center transition-transform duration-500 ${celebrate ? "scale-105" : ""}`}
          style={{ background: won ? "linear-gradient(135deg,#F59E0B,#DC2626)" : "linear-gradient(135deg,#2563EB,#0F1E4D)" }}
        >
          {outcome ? (
            <>
              <span className={`text-4xl ${celebrate ? "animate-bounce" : ""}`} aria-hidden="true">
                {won ? "🎉" : "🍀"}
              </span>
              <span className="text-lg font-extrabold text-white">{won ? outcome.prizeLabel : "Better luck next time"}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-white/80">Tap &quot;{buttonLabel}&quot; to start</span>
          )}
        </div>

        {celebrate && <ConfettiBurst />}

        {drawn && outcome && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none rounded-2xl"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <canvas ref={fxRef} className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl" />
          </>
        )}

        {outcome && !doneRef.current && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-white/80">{pct}%</span>
          </div>
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

// Small CSS-only confetti burst shown once a winning prize is revealed.
function ConfettiBurst() {
  const pieces = Array.from({ length: 18 }, (_, i) => i)
  const colors = ["#FCD34D", "#F97316", "#F43F5E", "#FDE68A", "#FFFFFF"]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {pieces.map((i) => {
        const left = 5 + ((i * 53) % 90)
        const delay = (i % 6) * 0.06
        const duration = 0.9 + (i % 5) * 0.15
        const color = colors[i % colors.length]
        const size = 5 + (i % 3) * 2
        return (
          <span
            key={i}
            className="absolute top-0 rounded-sm opacity-0"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 1.6,
              backgroundColor: color,
              animation: `zx-confetti-fall ${duration}s ease-in ${delay}s forwards`,
            }}
          />
        )
      })}
      <style jsx>{`
        @keyframes zx-confetti-fall {
          0% {
            transform: translateY(-10%) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(320%) rotate(540deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
