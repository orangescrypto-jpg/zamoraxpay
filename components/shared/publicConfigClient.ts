let adsensePromise: Promise<any> | null = null
let whatsappPromise: Promise<any> | null = null

export function getAdSenseConfig() {
  if (!adsensePromise) {
    adsensePromise = fetch("/api/adsense-config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("AdSense config failed"))))
      .catch((error) => { adsensePromise = null; throw error })
  }
  return adsensePromise
}

export function getWhatsAppSupport() {
  if (!whatsappPromise) {
    whatsappPromise = fetch("/api/whatsapp-support")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("WhatsApp config failed"))))
      .catch((error) => { whatsappPromise = null; throw error })
  }
  return whatsappPromise
}
