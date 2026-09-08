// components/shared/ShareButton.tsx
"use client"

import { useState } from "react"

interface ShareButtonProps {
  title: string
  text?: string
  url: string
  className?: string
}

export function ShareButton({ title, text, url, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    // navigator.share triggers the OS-native share sheet on mobile
    // (WhatsApp, Facebook, Twitter/X, Telegram, SMS, email, etc — every
    // app installed on the device that registers as a share target).
    // Desktop browsers mostly don't support it, so we fall back to
    // copying the link.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // User cancelled the share sheet — not an error worth surfacing.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — nothing more we can do silently.
    }
  }

  return (
    <button
      onClick={handleShare}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary hover:border-primary hover:text-primary"
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {copied ? "Link copied!" : "Share"}
    </button>
  )
}
