// hooks/useSoundEffects.ts
// Tiny sound-effects helper. Generates audio from the WebAudio API on
// demand so we don't ship any audio files. Respects the global "mute
// sounds" preference set in LocalExperienceTools (LS key
// `zamoraxpay:sound-muted:v1`).
//
// Sounds supported:
//   - click      (UI button click, very short)
//   - digit      (PIN keypad digit press)
//   - win        (game win, ascending notes)
//   - lose       (game loss, descending notes)
//   - success    (action success, single rising note)
//   - error      (action error, descending two-tone)
//
// Calls are no-ops on unsupported browsers (iOS Safari WebAudio needs
// a user gesture; we always call from inside a click handler so this
// is fine) or when the user has muted sounds.

"use client"

import { useCallback, useEffect, useState } from "react"
import { getRaw, setRaw } from "@/lib/storage"

const MUTE_KEY = "zamoraxpay:sound-muted:v1"

let audioCtx: AudioContext | null = null
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioCtx = new Ctor()
    }
    // Some browsers start the context in "suspended" state until a
    // user gesture; resume on demand.
    if (audioCtx.state === "suspended") void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function isMuted(): boolean {
  return getRaw(MUTE_KEY) === "1"
}

export function setSoundMuted(muted: boolean): void {
  setRaw(MUTE_KEY, muted ? "1" : "0")
  // Notify any subscribers via a custom event so React state can sync.
  try {
    window.dispatchEvent(new CustomEvent("zamoraxpay:sound-mute-changed", { detail: muted }))
  } catch {}
}

function playNotes(frequencies: number[], durationMs: number, type: OscillatorType = "sine", gain = 0.08): void {
  const ctx = getCtx()
  if (!ctx || isMuted()) return
  const now = ctx.currentTime
  const step = durationMs / 1000 / frequencies.length
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, now + i * step)
    g.gain.linearRampToValueAtTime(gain, now + i * step + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now + (i + 1) * step)
    osc.connect(g).connect(ctx.destination)
    osc.start(now + i * step)
    osc.stop(now + (i + 1) * step + 0.02)
  })
}

export type SoundName = "click" | "digit" | "win" | "lose" | "success" | "error"

export function playSound(name: SoundName): void {
  switch (name) {
    case "click":
      playNotes([600], 60, "square", 0.04)
      break
    case "digit":
      playNotes([440], 50, "sine", 0.05)
      break
    case "win":
      playNotes([523.25, 659.25, 783.99, 1046.5], 400, "triangle", 0.07)
      break
    case "lose":
      playNotes([392, 311.13, 261.63], 350, "sine", 0.05)
      break
    case "success":
      playNotes([659.25, 880], 180, "triangle", 0.06)
      break
    case "error":
      playNotes([311.13, 233.08], 220, "sawtooth", 0.05)
      break
  }
}

export function useSoundEffects() {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    setMutedState(isMuted())
    const onChange = (e: Event) => setMutedState((e as CustomEvent).detail as boolean)
    window.addEventListener("zamoraxpay:sound-mute-changed", onChange)
    return () => window.removeEventListener("zamoraxpay:sound-mute-changed", onChange)
  }, [])

  const toggleMute = useCallback(() => {
    const next = !isMuted()
    setSoundMuted(next)
    setMutedState(next)
  }, [])

  const play = useCallback((name: SoundName) => {
    if (isMuted()) return
    playSound(name)
  }, [])

  return { muted, toggleMute, play }
}
