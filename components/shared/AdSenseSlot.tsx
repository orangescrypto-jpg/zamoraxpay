// components/shared/AdSenseSlot.tsx
"use client"

// A single AdSense ad unit. Fetches its own config (enabled flag,
// publisher id, slot id) from /api/adsense-config so a slot on a
// server-rendered page like the homepage or a blog post can still be
// toggled instantly from the admin without a redeploy.
//
// slotKey selects which site_settings slot value to use, e.g.
// "homepage_footer" reads adsense_homepage_footer_slot.

import { useEffect, useRef, useState } from "react"

interface AdSenseSlotProps {
  slotKey: "homepage_footer" | "blog_post"
  className?: string
}

export function AdSenseSlot({ slotKey, className }: AdSenseSlotProps) {
  const [config, setConfig] = useState<{ enabled: boolean; clientId: string; slot: string } | null>(null)
  const insRef = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    fetch("/api/adsense-config")
      .then((res) => res.json())
      .then((data) =>
        setConfig({
          enabled: !!data.enabled,
          clientId: data.clientId ?? "",
          slot: data.slots?.[slotKey] ?? "",
        }),
      )
      .catch(() => setConfig({ enabled: false, clientId: "", slot: "" }))
  }, [slotKey])

  useEffect(() => {
    if (!config?.enabled || !config.clientId || !config.slot) return
    if (pushed.current) return
    try {
      // @ts-expect-error adsbygoogle is injected by the AdSense script
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch {
      // AdSense script may not have loaded yet — safe to ignore, the
      // slot will simply stay empty on this render.
    }
  }, [config])

  if (!config || !config.enabled || !config.clientId || !config.slot) return null

  return (
    <div className={className}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={config.clientId}
        data-ad-slot={config.slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
