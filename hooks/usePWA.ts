"use client"

import { useEffect, useState, useCallback } from "react"

const INSTALLED_KEY   = "zamoraxpay_pwa_installed"
const DISMISSED_KEY  = "zamoraxpay_pwa_dismissed_at"

// ─── iOS / Safari detection ────────────────────────────────────────────────
function detectIOS(): boolean {
  if (typeof window === "undefined") return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream
}

// Any mobile browser — used as a fallback so browsers that never fire
// beforeinstallprompt (Firefox mobile, in-app browsers, Chrome after the
// native prompt has already been shown/dismissed once for this browser
// profile) still get a manual "how to install" sheet instead of the
// install prompt silently never reappearing.
function detectMobile(): boolean {
  if (typeof window === "undefined") return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  )
}

// ─── useInstallPrompt ─────────────────────────────────────────────────────
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstalled,    setIsInstalled]    = useState(false)
  const [isIOS,          setIsIOS]          = useState(false)
  const [isMobile,       setIsMobile]       = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Detect iOS
    setIsIOS(detectIOS())
    setIsMobile(detectMobile())

    // Check if already installed via localStorage flag
    if (localStorage.getItem(INSTALLED_KEY) === "true") {
      setIsInstalled(true)
      return
    }

    // Check standalone mode (already installed)
    if (isStandalone()) {
      localStorage.setItem(INSTALLED_KEY, "true")
      setIsInstalled(true)
      return
    }

    // Listen for Chrome/Android beforeinstallprompt
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    // Listen for successful install
    const handleInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "true")
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handlePrompt)
    window.addEventListener("appinstalled", handleInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  /**
   * canShow(reshowAfterSec): true if not installed AND
   * (never dismissed OR dismissed more than reshowAfterSec seconds ago)
   */
  const canShow = useCallback((reshowAfterSec: number): boolean => {
    if (isInstalled) return false
    const dismissedAt = localStorage.getItem(DISMISSED_KEY)
    if (!dismissedAt) return true
    const elapsed = (Date.now() - parseInt(dismissedAt, 10)) / 1000
    return elapsed > reshowAfterSec
  }, [isInstalled])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "true")
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    setDeferredPrompt(null)
  }, [])

  return {
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    isIOS,
    isMobile,
    canShow,
    install,
    dismiss,
  }
}

// ─── usePWA — service worker registration ─────────────────────────────────
export function usePWA() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for SW updates on every page load
          reg.update().catch(() => {})

          // If a new SW activates, reload once so stale JS is cleared
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing
            if (!newWorker) return
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "activated" &&
                navigator.serviceWorker.controller
              ) {
                window.location.reload()
              }
            })
          })
        })
        .catch(() => {})
    }

    // Register after page load so SW doesn't compete with page resources
    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register, { once: true })
    }
  }, [])
}

// ─── requestPushPermission (unchanged) ────────────────────────────────────
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied"
  if (Notification.permission === "granted") return "granted"
  return Notification.requestPermission()
}
