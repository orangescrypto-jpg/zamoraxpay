import { createClient } from "@/src/services/providers/supabase/client"

let cachedToken: string | null = null
let cachedPromise: Promise<any> | null = null

export function getDashboardAnnouncements() {
  const supabase = createClient()
  return supabase.auth.getSession().then(({ data: { session } }) => {
    const token = session?.access_token ?? ""
    if (cachedPromise && cachedToken === token) return cachedPromise
    cachedToken = token
    cachedPromise = fetch("/api/dashboard-announcement", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Announcement request failed"))))
      .catch((error) => {
        cachedPromise = null
        throw error
      })
    return cachedPromise
  })
}
