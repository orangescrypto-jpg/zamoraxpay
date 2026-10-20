const KEY = "zamoraxpay:recent-phones"
const MAX = 5

export function getRecentPhones(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]")
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, MAX) : []
  } catch {
    return []
  }
}

export function pushRecentPhone(phone: string) {
  if (typeof window === "undefined" || !phone || phone.length < 10) return
  try {
    const next = [phone, ...getRecentPhones().filter((p) => p !== phone)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
}
