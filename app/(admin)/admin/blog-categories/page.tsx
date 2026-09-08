// app/(admin)/admin/blog-categories/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface Category {
  slug: string
  label: string
  description: string | null
  sort_order: number
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")
}

export default function AdminBlogCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState("")
  const [description, setDescription] = useState("")

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/blog/categories", { headers })
    const data = await res.json()
    setCategories(data.categories ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    const headers = await getAuthHeader()
    await fetch("/api/admin/blog/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ slug: slugify(label), label, description, sortOrder: categories.length }),
    })
    setLabel("")
    setDescription("")
    load()
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Delete category "${slug}"? Existing posts keep this category as text but it won't be selectable anymore.`)) return
    const headers = await getAuthHeader()
    await fetch(`/api/admin/blog/categories?slug=${slug}`, { method: "DELETE", headers })
    load()
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Blog Categories</h1>

      <div className="mb-8 rounded-lg border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Add Category</h2>
        <div className="mb-3 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Category name"
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={!label}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.slug} className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
              <div>
                <p className="text-sm font-medium text-secondary">{c.label}</p>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              </div>
              <button onClick={() => handleDelete(c.slug)} className="text-sm text-destructive hover:underline">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
