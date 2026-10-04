import type { Banner } from "@/src/types"

let bannersPromise: Promise<Banner[]> | null = null

export function getPublicBanners(): Promise<Banner[]> {
  if (!bannersPromise) {
    bannersPromise = fetch("/api/banners")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Banners request failed"))))
      .then((data) => (data.banners ?? []) as Banner[])
      .catch((error) => {
        bannersPromise = null
        throw error
      })
  }
  return bannersPromise
}
