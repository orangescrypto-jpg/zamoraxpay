// components/dashboard/ScratchCard.tsx
// Scratch-to-reveal card. DISPLAY ONLY: the prize is decided and saved on the server
// before this reveals — scratching just uncovers a result that already exists.
// Same onSpin/onDone contract as SpinWheel so SpinModal can swap between them.
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SpinOutcome } from "@/components/dashboard/useSpinStatus"
import type { WheelSpinResult } from "@/components/dashboard/SpinWheel"

const SIZE = 280
const SCRATCH_RADIUS = 26
const REVEAL_THRESHOLD = 0.55 // fraction of the canvas cleared before we auto-reveal
const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1

// Brand tokens (ZamoraxPay) — kept as literals so the canvas painter doesn't
// depend on Tailwind/CSS var resolution.
const BRAND = {
  primary: "#0057FF", // Electric Blue
  navy: "#0B1220", // near-black navy
  success: "#00D67A", // win state — matches app-wide cashback/success color
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; gold: boolean }

// Rounded-rect helper (roundRect isn't guaranteed on every canvas impl we target).
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Draws a real gold-foil coating: a brushed-metal sheen in warm gold tones (the
// material metaphor for "scratch and win"), a die-cut scalloped edge so the
// card reads as ticket stock rather than a flat rounded rectangle, and a
// engraved instruction plate at the center.
function paintFoil(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, SIZE, SIZE)

  // Scalloped die-cut silhouette — clip everything drawn after this to it.
  ctx.save()
  const notches = 14
  const r = 6
  const inset = 3
  ctx.beginPath()
  for (let i = 0; i <= notches; i++) {
    const x = inset + (i * (SIZE - inset * 2)) / notches
    ctx.arc(x, inset, r, Math.PI, 0, false)
  }
  for (let i = 0; i <= notches; i++) {
    const y = inset + (i * (SIZE - inset * 2)) / notches
    ctx.arc(SIZE - inset, y, r, Math.PI * 1.5, Math.PI * 0.5, false)
  }
  for (let i = 0; i <= notches; i++) {
    const x = SIZE - inset - (i * (SIZE - inset * 2)) / notches
    ctx.arc(x, SIZE - inset, r, 0, Math.PI, false)
  }
  for (let i = 0; i <= notches; i++) {
    const y = SIZE - inset - (i * (SIZE - inset * 2)) / notches
    ctx.arc(inset, y, r, Math.PI * 0.5, Math.PI * 1.5, false)
  }
  ctx.closePath()
  ctx.clip()

  // Base gold gradient — the material itself, not a flat tint.
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  g.addColorStop(0, "#C99A2E")
  g.addColorStop(0.28, "#F4E5A1")
  g.addColorStop(0.45, "#D4AF37")
  g.addColorStop(0.62, "#F6EFC9")
  g.addColorStop(0.8, "#B8862F")
  g.addColorStop(1, "#8F6B23")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Fine brushed-metal striations, angled, so light reads as combed rather than smeared.
  ctx.strokeStyle = "rgba(255,255,255,0.16)"
  ctx.lineWidth = 1
  for (let i = -SIZE; i < SIZE * 2; i += 4) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i - SIZE * 0.6, SIZE)
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(80,55,10,0.10)"
  for (let i = -SIZE; i < SIZE * 2; i += 4) {
    ctx.beginPath()
    ctx.moveTo(i + 2, 0)
    ctx.lineTo(i - SIZE * 0.6 + 2, SIZE)
    ctx.stroke()
  }

  // Diagonal sheen sweep — a lighter band crossing the surface, the classic
  // foil highlight rather than decoration.
  const sheen = ctx.createLinearGradient(0, SIZE * 0.15, SIZE, SIZE * 0.55)
  sheen.addColorStop(0, "rgba(255,255,255,0)")
  sheen.addColorStop(0.5, "rgba(255,255,255,0.35)")
  sheen.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Vignette for depth so it doesn't look pasted flat.
  const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.75)
  vg.addColorStop(0, "rgba(0,0,0,0)")
  vg.addColorStop(1, "rgba(60,40,5,0.28)")
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Repeated coin-mark texture, subtle, like genuine scratch-card stock.
  ctx.fillStyle = "rgba(255,255,255,0.10)"
  ctx.font = "11px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (let y = 20; y < SIZE; y += 40) {
    for (let x = 20 + ((y / 40) % 2) * 20; x < SIZE; x += 40) {
      ctx.fillText("●", x, y)
    }
  }

  // Engraved instruction plate — navy, matches app secondary color, feels
  // stamped into the foil rather than floating on top.
  const cx = SIZE / 2
  const cy = SIZE / 2
  ctx.fillStyle = "rgba(11,18,32,0.85)"
  rr(ctx, cx - 84, cy - 22, 168, 44, 22)
  ctx.fill()
  ctx.strokeStyle = "rgba(255,255,255,0.15)"
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = "#F4E5A1"
  ctx.font = "700 13px sans-serif"
  ctx.letterSpacing = "1px"
  ctx.fillText("SCRATCH TO REVEAL", cx, cy)
  ctx.letterSpacing = "0px"

  ctx.restore()
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

  // Lightweight particle burst that follows the scratch point — a mix of gold
  // "foil flake" and white "shine" specks, for a material feel instead of
  // generic confetti dust.
  const spawnParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 1.6
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        life: 1,
        size: 1.2 + Math.random() * 2.2,
        gold: Math.random() > 0.4,
      })
    }
    if (particlesRef.current.length > 180) particlesRef.current.splice(0, particlesRef.current.length - 180)
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
      p.vy += 0.07
      p.life -= 0.032
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.gold ? "#F4E5A1" : "#FFFDF3"
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
        className="relative overflow-hidden rounded-[28px] shadow-[0_20px_50px_-15px_rgba(11,18,32,0.55)] ring-1 ring-black/5"
        style={{ width: "min(78vw, 280px)", aspectRatio: "1 / 1" }}
      >
        {/* Reveal face — brand-consistent electric blue / navy panel, with a
            calm navy loss state (never punishing) and the app's own success
            green for wins, instead of an arbitrary red/orange. */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center transition-transform duration-500 ${celebrate ? "scale-[1.03]" : ""} ${scratching ? "animate-pulse" : ""}`}
          style={{
            background: won
              ? `radial-gradient(120% 120% at 50% 0%, ${BRAND.success} 0%, #049658 55%, ${BRAND.navy} 100%)`
              : `linear-gradient(160deg, ${BRAND.primary} 0%, #0038B8 45%, ${BRAND.navy} 100%)`,
          }}
        >
          {outcome ? (
            <>
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)" }}
                aria-hidden="true"
              >
                {won ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2" opacity="0.9" />
                    <path d="M9 9.5c0-1.4 1.2-2.5 3-2.5s3 1 3 2.3c0 1.6-1.6 1.9-2.6 2.9-.4.4-.6.9-.6 1.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
                    <circle cx="12" cy="17" r="1" fill="#fff" opacity="0.9" />
                  </svg>
                )}
              </span>
              <span className="text-[26px] font-extrabold leading-tight text-white">
                {won ? outcome.prizeLabel : "Not this time"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-white/70">
                {won ? "Added to your account" : "Try again next time"}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-white/80">
              {scratching ? "Loading your card…" : `Tap "${buttonLabel}" to start`}
            </span>
          )}
        </div>

        {celebrate && <ConfettiBurst />}

        {drawn && outcome && (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <canvas ref={fxRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </>
        )}

        {outcome && !doneRef.current && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full transition-[width] duration-150"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${BRAND.success}, #F4E5A1)` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums text-white/85">{pct}%</span>
          </div>
        )}
      </div>

      {/* Card and button unified as one object: button sits flush beneath,
          same corner language and a matching brand-blue fill instead of a
          separate floating pill. */}
      {!outcome && (
        <button
          onClick={handleGetCard}
          disabled={scratching || disabled}
          className="-mt-1 inline-flex min-w-[200px] items-center justify-center gap-2 rounded-b-2xl px-8 py-3.5 text-base font-bold tracking-wide text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: BRAND.primary, boxShadow: "0 10px 25px -8px rgba(0,87,255,0.55)" }}
        >
          {scratching ? "Loading…" : buttonLabel}
        </button>
      )}
      {outcome && !doneRef.current && (
        <p className="mt-4 text-center text-xs font-medium" style={{ color: BRAND.navy, opacity: 0.6 }}>
          Scratch the gold panel to reveal your prize
        </p>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}

// Small CSS-only confetti burst shown once a winning prize is revealed —
// gold + success-green pieces to match the brand win palette, not generic
// party colors.
function ConfettiBurst() {
  const pieces = Array.from({ length: 18 }, (_, i) => i)
  const colors = ["#F4E5A1", "#D4AF37", BRAND.success, "#FFFFFF"]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
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
