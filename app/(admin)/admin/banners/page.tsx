// app/(admin)/admin/banners/page.tsx
"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"
import { ImagePicker } from "@/components/admin/ImagePicker"

interface AdminBanner {
  id: string
  placement: "header_slider" | "footer"
  title: string | null
  image_url: string
  link_url: string | null
  sort_order: number
  is_active: number
}

export default function AdminBannersPage() {
  const [tab, setTab] = useState<"header_slider" | "footer">("header_slider")
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftLink, setDraftLink] = useState("")
  const [draftImageUrl, setDraftImageUrl] = useState("")

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadBanners() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/banners", { headers })
    const data = await res.json()
    setBanners(data.banners ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadBanners()
  }, [])

  async function handleAdd() {
    if (!draftImageUrl) return alert("Please upload an image first")

    const headers = await getAuthHeader()
    await fetch("/api/admin/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        placement: tab,
        title: draftTitle || null,
        imageUrl: draftImageUrl,
        linkUrl: draftLink || null,
        sortOrder: banners.filter((b) => b.placement === tab).length,
      }),
    })

    setDraftTitle("")
    setDraftLink("")
    setDraftImageUrl("")
    loadBanners()
  }

  async function toggleActive(banner: AdminBanner) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/banners", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: banner.id, isActive: banner.is_active !== 1 }),
    })
    loadBanners()
  }

  async function deleteBanner(id: string) {
    if (!confirm("Delete this banner?")) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/banners?id=${id}`, { method: "DELETE", headers })
    loadBanners()
  }

  const filtered = banners.filter((b) => b.placement === tab)

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Site Banners</h1>

      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setTab("header_slider")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium",
            tab === "header_slider" ? "bg-white shadow-sm" : "text-muted-foreground",
          )}
        >
          Header Slider (auto + manual)
        </button>
        <button
          onClick={() => setTab("footer")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium",
            tab === "footer" ? "bg-white shadow-sm" : "text-muted-foreground",
          )}
        >
          Footer Banner
        </button>
      </div>

      {/* Add new banner */}
      <div className="mb-8 rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Add New Banner</h2>

        <div className="mb-3">
          <ImagePicker value={draftImageUrl} onChange={setDraftImageUrl} folder="banners" label="Image" />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Title (optional overlay text)</label>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="50% off data bundles this week"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Link URL (optional)</label>
            <input
              value={draftLink}
              onChange={(e) => setDraftLink(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="https://zamorax.com or /services/data"
            />
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={!draftImageUrl}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Add Banner
        </button>
      </div>

      {/* Existing banners */}
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((banner) => (
            <div key={banner.id} className="flex items-center gap-4 rounded-lg border border-border p-3">
              <img src={banner.image_url} alt={banner.title ?? ""} className="h-16 w-28 rounded-md object-cover" />
              <div className="flex-1">
                <p className="text-sm font-medium">{banner.title || "(no title)"}</p>
                {banner.link_url && <p className="text-xs text-muted-foreground">{banner.link_url}</p>}
              </div>
              <button
                onClick={() => toggleActive(banner)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  banner.is_active === 1 ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground",
                )}
              >
                {banner.is_active === 1 ? "Active" : "Inactive"}
              </button>
              <button onClick={() => deleteBanner(banner.id)} className="text-sm text-destructive hover:underline">
                Delete
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No banners yet for this placement.</p>
          )}
        </div>
      )}
    </div>
  )
}
