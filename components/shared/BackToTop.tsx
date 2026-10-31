// components/shared/BackToTop.tsx
// Floating "scroll back to top" button. Appears after the user has
// scrolled past ~600px. Hidden on small screens if the bottom-nav
// is showing. Reuses the .zpx-back-to-top CSS hook that already
// existed in globals.css so it stacks correctly with the other
// floating tools (LocalExperienceTools, WhatsApp FAB).

"use client"

import { useEffect, useState } from "react"
import { ChevronUp } from "lucide-react"

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => {
      setVisible(window.scrollY > 600)
    }
    handler()
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Scroll back to top"
      onClick={() => {
        const reduce = document.documentElement.classList.contains("zpx-reduce-motion")
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
      }}
      className="zpx-back-to-top"
    >
      <ChevronUp className="h-5 w-5" aria-hidden />
    </button>
  )
}
