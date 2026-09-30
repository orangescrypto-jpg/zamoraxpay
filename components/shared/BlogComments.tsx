// components/shared/BlogComments.tsx
"use client"

import { useEffect, useState } from "react"
import { formatDate } from "@/lib/utils"

interface Comment {
  id: string
  name: string
  comment: string
  createdAt: string
}

interface Props {
  postSlug: string
}

/**
 * Reader comments on a blog post. Deliberately account-free — just a
 * display name and a comment. Submissions are held for moderation
 * (status 'pending') before they show here, so a fresh submit won't
 * appear in the list immediately; a confirmation message covers that.
 */
export function BlogComments({ postSlug }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/blog/posts/${postSlug}/comments`)
    if (res.ok) {
      const data = await res.json()
      setComments(data.comments ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [postSlug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)

    const res = await fetch(`/api/blog/posts/${postSlug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, comment: text }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error ?? "Failed to submit comment")
      return
    }

    setNotice(data.message ?? "Thanks! Your comment will appear once it's reviewed.")
    setName("")
    setText("")
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-heading font-bold text-secondary">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {loading && <p className="text-sm text-muted-foreground">Loading comments...</p>}

      {!loading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first to share your thoughts.</p>
      )}

      <div className="space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-secondary">{c.name}</span>
              <span aria-hidden className="text-muted-foreground">·</span>
              <time className="text-xs text-muted-foreground" dateTime={c.createdAt}>
                {formatDate(c.createdAt)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm text-secondary">{c.comment}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-3 rounded-lg border border-border p-4">
        <h3 className="font-medium text-secondary">Leave a comment</h3>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {notice && <p className="rounded-md bg-primary/10 p-3 text-sm text-primary">{notice}</p>}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          maxLength={80}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your comment"
          required
          rows={4}
          maxLength={3000}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !name.trim() || !text.trim()}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Posting..." : "Post Comment"}
        </button>
      </form>
    </section>
  )
}
