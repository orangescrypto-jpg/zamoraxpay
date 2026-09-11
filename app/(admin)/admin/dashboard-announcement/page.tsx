// app/(admin)/admin/dashboard-announcement/page.tsx
"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"
import { ImagePicker } from "@/components/admin/ImagePicker"

interface AdminAnnouncement {
  id: string
  text: string | null
  image_url: string | null
  link_url: string | null
  sort_order: number
  is_active: number
}

export default function AdminDashboardAnnouncementPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [draftText, setDraftText] = useState("")
  const [draftLink, setDraftLink] = useState("")
  const [draftImageUrl, setDraftImageUrl] = useState("")

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadAnnouncements() {
    setLoading(true)
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/dashboard-announcement", { headers })
    const data = await res.json()
    setAnnouncements((data.announcements ?? []).sort((a: AdminAnnouncement, b: AdminAnnouncement) => a.sort_order - b.sort_order))
    setLoading(false)
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

  async function handleAdd() {
    if (!draftText && !draftImageUrl) return alert("Add text, an image, or both")

    const headers = await getAuthHeader()
    await fetch("/api/admin/dashboard-announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        text: draftText || null,
        imageUrl: draftImageUrl || null,
        linkUrl: draftLink || null,
        sortOrder: announcements.length,
      }),
    })

    setDraftText("")
    setDraftLink("")
    setDraftImageUrl("")
    loadAnnouncements()
  }

  async function toggleActive(item: AdminAnnouncement) {
    const headers = await getAuthHeader()
    await fetch("/api/admin/dashboard-announcement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: item.id, isActive: item.is_active !== 1 }),
    })
    loadAnnouncements()
  }

  async function move(item: AdminAnnouncement, direction: -1 | 1) {
    const index = announcements.findIndex((a) => a.id === item.id)
    const swapWith = announcements[index + direction]
    if (!swapWith) return

    const headers = await getAuthHeader()
    await Promise.all([
      fetch("/api/admin/dashboard-announcement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id: item.id, sortOrder: swapWith.sort_order }),
      }),
      fetch("/api/admin/dashboard-announcement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id: swapWith.id, sortOrder: item.sort_order }),
      }),
    ])
    loadAnnouncements()
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm("Delete this announcement?")) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/dashboard-announcement?id=${id}`, { method: "DELETE", headers })
    loadAnnouncements()
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-heading font-bold">Dashboard Announcement</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Shown only on the user dashboard, between the wallet balance card and Quick actions. Use
        text, an image, or both per slide — the link is optional; leave it blank for a plain
        announcement. Multiple active slides auto-rotate every 5 seconds and can also be swiped
        manually, same as the header banner. Use the arrows below to reorder.
      </p>

      {/* Add new announcement */}
      <div className="mb-8 rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Add New Slide</h2>

        <div className="mb-3">
          <ImagePicker value={draftImageUrl} onChange={setDraftImageUrl} folder="banners" label="Image (optional)" />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-secondary">Text (optional)</label>
          <input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            placeholder="Scheduled maintenance tonight from 11pm–1am"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-secondary">Link URL (optional)</label>
          <input
            value={draftLink}
            onChange={(e) => setDraftLink(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            placeholder="/rewards or https://..."
          />
        </div>

        <button
          onClick={handleAdd}
          disabled={!draftText && !draftImageUrl}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Add Slide
        </button>
      </div>

      {/* Existing announcements */}
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((item, index) => (
            <div key={item.id} className="flex items-center gap-4 rounded-lg border border-border p-3">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => move(item, -1)}
                  disabled={index === 0}
                  className="text-xs text-muted-foreground hover:text-secondary disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(item, 1)}
                  disabled={index === announcements.length - 1}
                  className="text-xs text-muted-foreground hover:text-secondary disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              {item.image_url && (
                <img src={item.image_url} alt={item.text ?? ""} className="h-14 w-14 rounded-xl object-cover" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{item.text || "(image only)"}</p>
                {item.link_url && <p className="text-xs text-muted-foreground">{item.link_url}</p>}
              </div>
              <button
                onClick={() => toggleActive(item)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  item.is_active === 1 ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground",
                )}
              >
                {item.is_active === 1 ? "Active" : "Inactive"}
              </button>
              <button onClick={() => deleteAnnouncement(item.id)} className="text-sm text-destructive hover:underline">
                Delete
              </button>
            </div>
          ))}
          {announcements.length === 0 && (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
