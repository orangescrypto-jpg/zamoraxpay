// components/admin/BlogPostForm.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SimpleBlogEditor } from "@/components/admin/SimpleBlogEditor"
import { ImagePicker } from "@/components/admin/ImagePicker"
import { createClient } from "@/src/services/providers/supabase/client"

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

interface BlogPostFormProps {
  postId?: string
  initial?: {
    slug: string
    title: string
    excerpt: string
    contentMarkdown: string
    coverImageUrl: string
    category: string
    authorName: string
    metaDescription: string
    status: "draft" | "published"
  }
}

export function BlogPostForm({ postId, initial }: BlogPostFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "")
  const [contentMarkdown, setContentMarkdown] = useState(initial?.contentMarkdown ?? "")
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl ?? "")
  const [category, setCategory] = useState(initial?.category ?? "guides")
  const [authorName, setAuthorName] = useState(initial?.authorName ?? "The ZamoraxPay Team")
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? "")
  const [status, setStatus] = useState<"draft" | "published">(initial?.status ?? "draft")
  const [categories, setCategories] = useState<{ slug: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/blog/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]))
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const payload = {
      slug: slug || slugify(title),
      title,
      excerpt,
      contentMarkdown,
      coverImageUrl,
      category,
      authorName,
      metaDescription,
      status,
    }

    const res = await fetch(postId ? `/api/admin/blog/posts/${postId}` : "/api/admin/blog/posts", {
      method: postId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to save post")
      return
    }

    router.push("/admin/blog")
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="text-2xl font-heading font-bold">{postId ? "Edit Post" : "New Post"}</h1>

      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Title</label>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (!postId) setSlug(slugify(e.target.value))
          }}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="How to Check Your WAEC Result"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="how-to-check-waec-result"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>

      <div>
        <ImagePicker value={coverImageUrl} onChange={setCoverImageUrl} folder="blog" label="Cover Image" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Excerpt</label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          placeholder="A one-sentence summary shown on the blog listing page"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Content</label>
        <SimpleBlogEditor value={contentMarkdown} onChange={setContentMarkdown} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Author Name</label>
        <input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-secondary">Meta Description (SEO)</label>
        <input
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !title || !contentMarkdown}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving..." : postId ? "Save Changes" : "Create Post"}
      </button>
    </div>
  )
}
