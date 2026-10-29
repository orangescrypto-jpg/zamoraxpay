// components/shared/GuidedTour.tsx
// Lightweight first-time-user guided tour (coach marks). Pure client-side.
// Renders an overlay + popover that highlights a CSS selector and
// explains what the highlighted element does. Steps are defined in code
// so no API/DB needed.
//
// Persistence: once the user clicks "Got it" or "Skip tour", we set a
// localStorage flag so the tour never re-shows. They can re-trigger it
// from the Page tools panel if they want a refresher.
//
// The tour auto-starts the first time a logged-in user lands on
// /dashboard and has no `zamoraxpay:tours-completed:v1` entry. Each
// step targets a CSS selector on the current page; if the selector
// isn't found, the step is skipped (no broken-looking popover).

"use client"

import { useEffect, useState } from "react"
import { ArrowRight, X } from "lucide-react"
import { getRaw, setRaw } from "@/lib/storage"

const TOURS_COMPLETED_KEY = "zamoraxpay:tours-completed:v1"
const TOUR_TRIGGER_KEY = "zamoraxpay:tour-retrigger:v1"

export interface TourStep {
  selector: string          // CSS selector of the element to highlight
  title: string
  body: string
  /** Optional: position the popover relative to the target. Default: bottom. */
  position?: "top" | "bottom" | "left" | "right" | "center"
}

export interface TourDef {
  id: string                // unique tour id; stored in completed list
  steps: TourStep[]
}

interface GuidedTourProps {
  tour: TourDef
  /** When true, force-show the tour regardless of completion state.
   *  Used by the "Replay tour" button in Page tools. */
  forceOpen?: boolean
  onDismiss?: () => void
}

/**
 * Determine where to place the popover relative to the highlighted rect.
 * Falls back to viewport center if the target is off-screen or missing.
 */
function computePosition(rect: DOMRect, position: NonNullable<TourStep["position"]>) {
  const margin = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  // If the target rect is entirely off-screen, center the popover.
  if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
    return { top: vh / 2 - 100, left: Math.max(margin, vw / 2 - 160) }
  }
  const popoverWidth = Math.min(320, vw - margin * 2)
  let top: number
  let left: number
  switch (position) {
    case "top":
      top = Math.max(margin, rect.top - 180)
      left = Math.max(margin, Math.min(vw - popoverWidth - margin, rect.left + rect.width / 2 - popoverWidth / 2))
      break
    case "left":
      top = Math.max(margin, Math.min(vh - 200, rect.top))
      left = Math.max(margin, rect.left - popoverWidth - margin)
      break
    case "right":
      top = Math.max(margin, Math.min(vh - 200, rect.top))
      left = Math.min(vw - popoverWidth - margin, rect.right + margin)
      break
    case "bottom":
    default:
      top = Math.min(vh - 200, rect.bottom + margin)
      left = Math.max(margin, Math.min(vw - popoverWidth - margin, rect.left + rect.width / 2 - popoverWidth / 2))
      break
  }
  return { top, left }
}

export function GuidedTour({ tour, forceOpen, onDismiss }: GuidedTourProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Read completion state on mount.
  useEffect(() => {
    if (forceOpen) {
      setOpen(true)
      setStepIdx(0)
      return
    }
    try {
      const completed: string[] = JSON.parse(getRaw(TOURS_COMPLETED_KEY) || "[]")
      if (!completed.includes(tour.id)) {
        // Small delay so the dashboard's first render has time to lay
        // out the elements we want to highlight.
        const t = setTimeout(() => {
          setOpen(true)
          setStepIdx(0)
        }, 800)
        return () => clearTimeout(t)
      }
    } catch { /* malformed storage entry - ignore */ }
  }, [tour.id, forceOpen])

  // Listen for re-trigger requests from Page tools.
  useEffect(() => {
    const onReTrigger = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined
      if (!detail || detail === tour.id) {
        setOpen(true)
        setStepIdx(0)
      }
    }
    window.addEventListener("zamoraxpay:tour-retrigger", onReTrigger)
    return () => window.removeEventListener("zamoraxpay:tour-retrigger", onReTrigger)
  }, [tour.id])

  // Position the popover every time the step changes or the window resizes.
  useEffect(() => {
    if (!open) return
    const step = tour.steps[stepIdx]
    if (!step) {
      setOpen(false)
      return
    }
    const position = step.position ?? "bottom"
    const target = document.querySelector(step.selector)
    const rect = target?.getBoundingClientRect()
    if (!rect || rect.width === 0) {
      // Skip the step silently if the target doesn't exist on this page.
      if (stepIdx < tour.steps.length - 1) {
        setStepIdx((i) => i + 1)
      } else {
        setOpen(false)
      }
      return
    }
    setPos(computePosition(rect, position))
    const onResize = () => {
      const r = target?.getBoundingClientRect()
      if (r) setPos(computePosition(r, position))
    }
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [open, stepIdx, tour.steps])

  if (!open || !pos) return null

  const step = tour.steps[stepIdx]
  const isLast = stepIdx >= tour.steps.length - 1

  function markComplete() {
    try {
      const completed: string[] = JSON.parse(getRaw(TOURS_COMPLETED_KEY) || "[]")
      if (!completed.includes(tour.id)) {
        completed.push(tour.id)
        setRaw(TOURS_COMPLETED_KEY, JSON.stringify(completed))
      }
    } catch {}
    setOpen(false)
    onDismiss?.()
  }

  return (
    <div className="zpx-tour-overlay" onClick={markComplete}>
      <div
        className="zpx-tour-pop"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3>{step.title}</h3>
          <button type="button" aria-label="Close tour" onClick={markComplete} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p>{step.body}</p>
        <div className="zpx-tour-actions">
          <button type="button" onClick={markComplete} className="text-xs font-medium text-muted-foreground hover:text-secondary dark:hover:text-foreground">
            Skip tour
          </button>
          {isLast ? (
            <button type="button" onClick={markComplete} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => i + 1)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Next
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* Progress dots */}
        <div className="mt-2 flex items-center gap-1">
          {tour.steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === stepIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Helper: programmatically re-trigger a tour by id (or all tours). */
export function retriggerTour(tourId?: string) {
  try {
    window.dispatchEvent(new CustomEvent("zamoraxpay:tour-retrigger", { detail: tourId }))
  } catch {}
}

/** Helper: clear all tour completion state. */
export function resetTours() {
  try {
    setRaw(TOURS_COMPLETED_KEY, "[]")
  } catch {}
}
