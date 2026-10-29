"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Accessibility, ArrowUp, Bookmark, Check, Compass, Minus, Plus, Settings2, Volume2, VolumeX, Wifi, X, FileText, Trash2 } from "lucide-react"
import { usePathname } from "next/navigation"
import { getJSON, setJSON, remove as removeKey } from "@/lib/storage"
import { useSoundEffects } from "@/hooks/useSoundEffects"
import { retriggerTour, resetTours } from "@/components/shared/GuidedTour"

type Preferences = {
  textScale: number
  highContrast: boolean
  reduceMotion: boolean
  lowDataMode: boolean
}
const DEFAULTS: Preferences = { textScale: 1, highContrast: false, reduceMotion: false, lowDataMode: false }
const PREF_KEY = "zamoraxpay:local-experience-preferences:v1"
const SAVED_KEY = "zamoraxpay:saved-pages:v1"
const SAVED_PAGES_MAX = 50

function readPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || "null")
    if (!parsed || typeof parsed !== "object") return DEFAULTS
    return {
      textScale: [0.9, 1, 1.1, 1.2].includes(parsed.textScale) ? parsed.textScale : 1,
      highContrast: Boolean(parsed.highContrast),
      reduceMotion: Boolean(parsed.reduceMotion),
      lowDataMode: Boolean(parsed.lowDataMode),
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
  const [savedPages, setSavedPages] = useState<string[]>([])
  const [showSavedPanel, setShowSavedPanel] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showTop, setShowTop] = useState(false)
  const sound = useSoundEffects()

  useEffect(() => {
    setPreferences(readPreferences())
    try {
      const pages: string[] = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")
      setSaved(pages.includes(pathname))
      setSavedPages(pages.slice(0, SAVED_PAGES_MAX))
    } catch { setSaved(false); setSavedPages([]) }
    setReady(true)

    // Respect the browser's prefers-reduced-data hint (Network Information
    // API). If the user is on a metered or slow connection AND hasn't
    // explicitly set their own preference yet, auto-enable low-data mode
    // on first visit. We only auto-enable once - after that, the user's
    // explicit choice wins.
    try {
      const alreadySet = localStorage.getItem(PREF_KEY) != null
      if (!alreadySet && typeof window !== "undefined") {
        const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
        const prefersReducedData = window.matchMedia("(prefers-reduced-data: reduce)").matches
        const slowNetwork = conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g"
        const saveData = conn?.saveData === true
        if (prefersReducedData || slowNetwork || saveData) {
          setPreferences((prev) => ({ ...prev, lowDataMode: true }))
        }
      }
    } catch { /* non-fatal */ }
  }, [pathname])

  useEffect(() => {
    if (!ready) return
    document.documentElement.style.setProperty("--local-text-scale", String(preferences.textScale))
    document.documentElement.classList.toggle("zpx-high-contrast", preferences.highContrast)
    document.documentElement.classList.toggle("zpx-reduce-motion", preferences.reduceMotion)
    document.documentElement.classList.toggle("zpx-low-data", preferences.lowDataMode)
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
      const next = saved
        ? pages.filter((page) => page !== pathname)
        : Array.from(new Set([...pages, pathname])).slice(0, SAVED_PAGES_MAX)
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
      setSaved(!saved)
      setSavedPages(next)
    } catch { setSaved(false) }
  }

  function removeSavedPage(path: string) {
    const pages: string[] = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")
    const next = pages.filter((p) => p !== path)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    setSavedPages(next)
    if (path === pathname) setSaved(false)
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
          lowDataMode: Boolean(imported.lowDataMode),
        }
        setPreferences(next)
        localStorage.setItem(PREF_KEY, JSON.stringify(next))
        const pages = Array.isArray(payload.savedPages) ? payload.savedPages.filter((value: unknown) => typeof value === "string" && (value as string).startsWith("/")) : []
        localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(new Set(pages)).slice(0, SAVED_PAGES_MAX)))
        setSavedPages(pages)
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
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" /> Low-data mode</span>
            <input type="checkbox" checked={preferences.lowDataMode} onChange={(e) => updatePreferences({ lowDataMode: e.target.checked })} />
          </label>
          {preferences.lowDataMode && <p className="mt-1 text-[11px] text-muted-foreground">Hides decorative images. Saves data on slow networks.</p>}

          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5">{sound.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} Sound effects</span>
            <input type="checkbox" checked={!sound.muted} onChange={() => sound.toggleMute()} />
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">Plays short sounds on wins, errors, and key presses.</p>

          <button type="button" onClick={toggleSaved} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:border-primary hover:text-primary">{saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{saved ? "Page saved on this device" : "Save this page on this device"}</button>

          {/* Saved pages list - now actually readable in-app (was missing before) */}
          {savedPages.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowSavedPanel((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground hover:text-primary"
                aria-expanded={showSavedPanel}
              >
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Saved pages ({savedPages.length})</span>
                <span>{showSavedPanel ? "Hide" : "Show"}</span>
              </button>
              {showSavedPanel && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {savedPages.map((p) => (
                    <li key={p} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <Link href={p} onClick={() => setOpen(false)} className="min-w-0 flex-1 truncate text-xs text-secondary hover:text-primary dark:text-foreground">{p}</Link>
                      <button type="button" aria-label={`Remove ${p} from saved pages`} onClick={() => removeSavedPage(p)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={exportLocalSettings} className="rounded-lg border border-border px-2 py-2 text-xs font-medium hover:border-primary hover:text-primary">Export settings</button>
            <label className="cursor-pointer rounded-lg border border-border px-2 py-2 text-center text-xs font-medium hover:border-primary hover:text-primary">Import settings<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { importLocalSettings(event.target.files?.[0]); event.currentTarget.value = "" }} /></label>
          </div>

          {/* Replay guided tour - only on the dashboard where the tour
              actually has something to highlight. */}
          {pathname.startsWith("/dashboard") && (
            <button
              type="button"
              onClick={() => retriggerTour("dashboard-v1")}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-medium hover:border-primary hover:text-primary"
            >
              <Compass className="h-4 w-4" />
              Replay dashboard tour
            </button>
          )}

          <button type="button" onClick={() => { updatePreferences(DEFAULTS); try { removeKey(PREF_KEY); removeKey(SAVED_KEY); setSavedPages([]); setSaved(false); resetTours() } catch { /* ignore */ } }} className="mt-2 w-full rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted">Reset preferences</button>
        </section>}
        <button type="button" aria-label="Open accessibility and page tools" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="zpx-tools-trigger"><Accessibility className="h-5 w-5" /><span className="hidden sm:inline">Page tools</span><Settings2 className="h-4 w-4 opacity-70" /></button>
      </div>
    </>
  )
}
