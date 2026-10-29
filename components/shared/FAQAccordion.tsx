// components/shared/FAQAccordion.tsx
// Accessible accordion item used by the Help Center FAQ page.
// Native <details>/<summary> would also work, but we want a controlled
// open state and proper focus styling for screen readers.

"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface FAQAccordionProps {
  question: string
  answer: string
  defaultOpen?: boolean
}

export function FAQAccordion({ question, answer, defaultOpen = false }: FAQAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `faq-panel-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`
  const buttonId = `faq-button-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`

  return (
    <div className="overflow-hidden first:rounded-t-xl last:rounded-b-xl">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-secondary transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset dark:text-foreground"
      >
        <span>{question}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
        >
          {answer}
        </div>
      )}
    </div>
  )
}
