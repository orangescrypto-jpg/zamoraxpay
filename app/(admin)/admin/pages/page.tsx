// app/(admin)/admin/pages/page.tsx
"use client"

import { useEffect, useState } from "react"
import { SimpleBlogEditor } from "@/components/admin/SimpleBlogEditor"
import { createClient } from "@/src/services/providers/supabase/client"
import type { SitePage } from "@/src/types"

export default function AdminPagesPage() {
  const [pages, setPages] = useState<SitePage[]>([])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [title, setTitle] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function loadPages() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/pages", { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const data = await res.json()
    const mapped: SitePage[] = (data.pages ?? []).map((p: any) => ({
      slug: p.slug,
      title: p.title,
      contentMarkdown: p.content_markdown,
      metaDescription: p.meta_description,
    }))
    setPages(mapped)
    if (mapped.length && !activeSlug) selectPage(mapped[0])
  }

  useEffect(() => {
    loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectPage(page: SitePage) {
    setActiveSlug(page.slug)
    setTitle(page.title)
    setContent(page.contentMarkdown)
    setMetaDescription(page.metaDescription ?? "")
    setSaved(false)
  }

  async function handleSave() {
    if (!activeSlug) return
    setSaving(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    await fetch("/api/admin/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ slug: activeSlug, title, contentMarkdown: content, metaDescription }),
    })

    setSaving(false)
    setSaved(true)
    loadPages()
  }

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <aside className="shrink-0 border-b border-border p-4 lg:w-56 lg:border-b-0 lg:border-r">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Site Pages</h2>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {pages.map((page) => (
            <li key={page.slug} className="shrink-0 lg:shrink">
              <button
                onClick={() => selectPage(page)}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-left text-sm lg:w-full ${
                  activeSlug === page.slug ? "bg-primary/10 font-medium text-primary" : "text-secondary hover:bg-muted"
                }`}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
        {activeSlug ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Page Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Content</label>
              <SimpleBlogEditor value={content} onChange={setContent} minHeight={500} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Meta Description (SEO)</label>
              <input
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:w-auto"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {saved && <span className="text-sm text-accent">Saved</span>}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Loading pages...</p>
        )}
      </div>
    </div>
  )
}
