// app/(admin)/admin/blog-authors/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { ImagePicker } from "@/components/admin/ImagePicker"

interface Author {
  id: string
  slug: string
  name: string
  bio: string | null
  photoUrl: string | null
  isActive: boolean
}

const EMPTY = { name: "", bio: "", photoUrl: "", isActive: true }

// Authors library: outside writers or staff who need a public byline +
// profile page. No login account required — just add their name, bio,
// and photo here, then pick them from the dropdown on any blog post.
export default function AdminBlogAuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/blog-authors", { headers })
    const data = await res.json()
    setAuthors(data.authors ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function edit(a: Author) {
    setEditingId(a.id)
    setForm({ name: a.name, bio: a.bio ?? "", photoUrl: a.photoUrl ?? "", isActive: a.isActive })
    setError(null)
  }

  function reset() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const headers = await getAuthHeader()
    const res = await fetch(editingId ? `/api/admin/blog-authors/${editingId}` : "/api/admin/blog-authors", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? "Failed to save author")
      return
    }
    reset()
    load()
  }

  async function remove(id: string) {
    if (!confirm("Delete this author? Posts keep their byline text; only the link to this profile is removed.")) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/blog-authors/${id}`, { method: "DELETE", headers })
    load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Blog Authors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add external writers or staff bylines here — name, bio, and photo. No login account is needed. Once added,
          pick them from the dropdown when creating or editing a blog post.
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border p-5">
        <h2 className="font-medium">{editingId ? "Edit author" : "Add author"}</h2>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Author name"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Bio</label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={3}
            placeholder="Shown on the author's public profile page"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <ImagePicker value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} folder="blog" label="Photo" />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Active (shown in the post dropdown and has a public profile page)
        </label>

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add author"}
          </button>
          {editingId && (
            <button onClick={reset} className="rounded-md border border-border px-4 py-2 text-sm">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && authors.length === 0 && <p className="text-sm text-muted-foreground">No authors yet.</p>}
        {authors.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-4">
            <div className="flex items-center gap-3">
              {a.photoUrl ? (
                <img src={a.photoUrl} alt={a.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                  {a.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-medium">
                  {a.name}
                  {!a.isActive && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>}
                </p>
                <p className="text-xs text-muted-foreground">/blog/authors/{a.slug}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => edit(a)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                Edit
              </button>
              <button onClick={() => remove(a.id)} className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
