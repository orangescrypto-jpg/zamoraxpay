// app/(admin)/admin/dashboard-announcement/page.tsx
"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"
import { ImagePicker } from "@/components/admin/ImagePicker"

type DisplayStyle = "banner" | "popup"
type Audience = "all" | "retail" | "reseller"

interface AdminAnnouncement {
  id: string
  text: string | null
  image_url: string | null
  link_url: string | null
  sort_order: number
  is_active: number
  display_style: DisplayStyle
  background_color: string | null
  audience: Audience
  show_once: number
}

export default function AdminDashboardAnnouncementPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [draftText, setDraftText] = useState("")
  const [draftLink, setDraftLink] = useState("")
  const [draftImageUrl, setDraftImageUrl] = useState("")
  const [draftDisplayStyle, setDraftDisplayStyle] = useState<DisplayStyle>("banner")
  const [draftBackgroundColor, setDraftBackgroundColor] = useState("#0F1E4D")
  const [draftAudience, setDraftAudience] = useState<Audience>("all")
  const [draftShowOnce, setDraftShowOnce] = useState(false)

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
        displayStyle: draftDisplayStyle,
        backgroundColor: draftBackgroundColor || null,
        audience: draftAudience,
        showOnce: draftDisplayStyle === "popup" ? draftShowOnce : false,
      }),
    })

    setDraftText("")
    setDraftLink("")
    setDraftImageUrl("")
    setDraftDisplayStyle("banner")
    setDraftBackgroundColor("#0F1E4D")
    setDraftAudience("all")
    setDraftShowOnce(false)
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
        Banner items show as a strip between the wallet balance card and Quick actions, and
        auto-rotate every 5 seconds if there's more than one. Popup items show as a centered modal
        once the dashboard loads — only the first eligible popup shows at a time. Use text, an
        image, or both per item; the link is optional. Audience lets you target retail or reseller
        users only, or leave it as "Everyone". Use the arrows below to reorder banner items.
      </p>

      {/* Add new announcement */}
      <div className="mb-8 rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Add New Item</h2>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-secondary">Display style</label>
          <div className="flex gap-2">
            {(["banner", "popup"] as DisplayStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setDraftDisplayStyle(style)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  draftDisplayStyle === style ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

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

        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm font-medium text-secondary">Background color</label>
          <input
            type="color"
            value={draftBackgroundColor}
            onChange={(e) => setDraftBackgroundColor(e.target.value)}
            className="h-8 w-14 cursor-pointer rounded border border-border"
          />
          <span className="text-xs text-muted-foreground">Used when there's no image, or behind a popup's text</span>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-secondary">Audience</label>
          <div className="flex gap-2">
            {([
              { value: "all", label: "Everyone" },
              { value: "retail", label: "Retail" },
              { value: "reseller", label: "Reseller" },
            ] as { value: Audience; label: string }[]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDraftAudience(opt.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  draftAudience === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {draftDisplayStyle === "popup" && (
          <div className="mb-3 flex items-center gap-2">
            <input
              id="show-once"
              type="checkbox"
              checked={draftShowOnce}
              onChange={(e) => setDraftShowOnce(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="show-once" className="text-sm text-secondary">
              Show only once per user (otherwise reappears every login)
            </label>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!draftText && !draftImageUrl}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Add Item
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
              {!item.image_url && item.background_color && (
                <div
                  className="h-14 w-14 shrink-0 rounded-xl"
                  style={{ backgroundColor: item.background_color }}
                />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">{item.text || "(image only)"}</p>
                {item.link_url && <p className="text-xs text-muted-foreground">{item.link_url}</p>}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                    {item.display_style}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                    {item.audience === "all" ? "Everyone" : item.audience}
                  </span>
                  {item.display_style === "popup" && item.show_once === 1 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Once only
                    </span>
                  )}
                </div>
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
