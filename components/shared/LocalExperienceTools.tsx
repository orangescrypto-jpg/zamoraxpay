"use client"

import { useEffect, useMemo, useState } from "react"
import { Accessibility, ArrowUp, Bookmark, Check, Minus, Plus, Settings2, X } from "lucide-react"
import { usePathname } from "next/navigation"

type Preferences = { textScale: number; highContrast: boolean; reduceMotion: boolean }
const DEFAULTS: Preferences = { textScale: 1, highContrast: false, reduceMotion: false }
const PREF_KEY = "zamoraxpay:local-experience-preferences:v1"
const SAVED_KEY = "zamoraxpay:saved-pages:v1"

function readPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || "null")
    if (!parsed || typeof parsed !== "object") return DEFAULTS
    return {
      textScale: [0.9, 1, 1.1, 1.2].includes(parsed.textScale) ? parsed.textScale : 1,
      highContrast: Boolean(parsed.highContrast),
      reduceMotion: Boolean(parsed.reduceMotion),
    }
  } catch { return DEFAULTS }
}

export function LocalExperienceTools() {
  const pathname = usePathname() || "/"
  const isArticle = pathname.startsWith("/blog/") && !pathname.startsWith("/blog/authors/")
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    setPreferences(readPreferences())
    try {
      const pages: string[] = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")
      setSaved(pages.includes(pathname))
    } catch { setSaved(false) }
    setReady(true)
  }, [pathname])

  useEffect(() => {
    if (!ready) return
    document.documentElement.style.setProperty("--local-text-scale", String(preferences.textScale))
    document.documentElement.classList.toggle("zpx-high-contrast", preferences.highContrast)
    document.documentElement.classList.toggle("zpx-reduce-motion", preferences.reduceMotion)
    try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)) } catch { /* storage may be unavailable */ }
  }, [preferences, ready])

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0)
      setShowTop(window.scrollY > 500)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update) }
  }, [pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
      if ((event.altKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const textLabel = useMemo(() => `${Math.round(preferences.textScale * 100)}%`, [preferences.textScale])
  if (pathname.startsWith("/admin")) return null

  function toggleSaved() {
    try {
      const pages: string[] = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")
      const next = saved ? pages.filter((page) => page !== pathname) : Array.from(new Set([...pages, pathname]))
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
      setSaved(!saved)
    } catch { setSaved(false) }
  }

  function updatePreferences(patch: Partial<Preferences>) {
    setPreferences((current) => ({ ...current, ...patch }))
  }

  function exportLocalSettings() {
    try {
      const payload = {
        format: "zamoraxpay-local-preferences",
        version: 1,
        preferences: JSON.parse(localStorage.getItem(PREF_KEY) || JSON.stringify(DEFAULTS)),
        savedPages: JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "zamoraxpay-local-preferences.json"
      anchor.click()
      URL.revokeObjectURL(url)
    } catch { /* browser download/storage may be unavailable */ }
  }

  function importLocalSettings(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || ""))
        if (payload?.format !== "zamoraxpay-local-preferences" || payload?.version !== 1) return
        const imported = payload.preferences || {}
        const next: Preferences = {
          textScale: [0.9, 1, 1.1, 1.2].includes(imported.textScale) ? imported.textScale : 1,
          highContrast: Boolean(imported.highContrast),
          reduceMotion: Boolean(imported.reduceMotion),
        }
        setPreferences(next)
        localStorage.setItem(PREF_KEY, JSON.stringify(next))
        const pages = Array.isArray(payload.savedPages) ? payload.savedPages.filter((value: unknown) => typeof value === "string" && value.startsWith("/")) : []
        localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(new Set(pages))))
        setSaved(pages.includes(pathname))
      } catch { /* invalid or unsupported import files are ignored */ }
    }
    reader.readAsText(file)
  }

  return (
    <>
      {isArticle && <div aria-hidden="true" className="zpx-reading-progress" style={{ width: `${progress}%` }} />}
      {showTop && <button type="button" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: preferences.reduceMotion ? "auto" : "smooth" })} className="zpx-back-to-top"><ArrowUp className="h-4 w-4" /></button>}
      <div className="zpx-local-tools">
        {open && <section className="zpx-tools-panel" aria-label="Page tools">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <div><p className="text-sm font-semibold text-secondary">Page tools</p><p className="text-xs text-muted-foreground">Saved on this device only</p></div>
            <button type="button" aria-label="Close page tools" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div><p className="text-sm font-medium text-secondary">Text size</p><p className="text-xs text-muted-foreground">{textLabel}</p></div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Decrease text size" disabled={preferences.textScale <= 0.9} onClick={() => updatePreferences({ textScale: Math.max(0.9, Number((preferences.textScale - 0.1).toFixed(1))) })} className="rounded-lg border border-border p-2 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <button type="button" aria-label="Increase text size" disabled={preferences.textScale >= 1.2} onClick={() => updatePreferences({ textScale: Math.min(1.2, Number((preferences.textScale + 0.1).toFixed(1))) })} className="rounded-lg border border-border p-2 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm"><span>Higher contrast</span><input type="checkbox" checked={preferences.highContrast} onChange={(e) => updatePreferences({ highContrast: e.target.checked })} /></label>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm"><span>Reduce motion</span><input type="checkbox" checked={preferences.reduceMotion} onChange={(e) => updatePreferences({ reduceMotion: e.target.checked })} /></label>
          <button type="button" onClick={toggleSaved} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:border-primary hover:text-primary">{saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{saved ? "Page saved on this device" : "Save this page on this device"}</button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={exportLocalSettings} className="rounded-lg border border-border px-2 py-2 text-xs font-medium hover:border-primary hover:text-primary">Export settings</button>
            <label className="cursor-pointer rounded-lg border border-border px-2 py-2 text-center text-xs font-medium hover:border-primary hover:text-primary">Import settings<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { importLocalSettings(event.target.files?.[0]); event.currentTarget.value = "" }} /></label>
          </div>
          <button type="button" onClick={() => { updatePreferences(DEFAULTS); try { localStorage.removeItem(PREF_KEY) } catch { /* ignore */ } }} className="mt-2 w-full rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted">Reset preferences</button>
        </section>}
        <button type="button" aria-label="Open accessibility and page tools" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="zpx-tools-trigger"><Accessibility className="h-5 w-5" /><span className="hidden sm:inline">Page tools</span><Settings2 className="h-4 w-4 opacity-70" /></button>
      </div>
    </>
  )
}
