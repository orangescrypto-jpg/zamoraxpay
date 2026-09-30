// components/admin/AuthorSelect.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface Author {
  id: string
  name: string
  photoUrl: string | null
  isActive: boolean
}

interface Props {
  authorId: string | null
  authorName: string
  onChange: (authorId: string | null, authorName: string) => void
}

/**
 * Dropdown of authors from the Authors library (external writers or
 * staff added at /admin/blog-authors). Picking one links the post to
 * that author's public profile page and fills the byline name — the
 * name stays freely editable afterward without breaking the link.
 * Picking "— No linked author —" clears the link but keeps whatever
 * name is currently typed, so a quick byline like "The ZamoraxPay Team"
 * still works without needing an Authors entry.
 */
export function AuthorSelect({ authorId, authorName, onChange }: Props) {
  const [authors, setAuthors] = useState<Author[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/blog-authors", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAuthors(data.authors ?? [])
      }
    }
    load()
  }, [])

  function pick(id: string) {
    if (!id) {
      onChange(null, authorName)
      return
    }
    const a = authors.find((x) => x.id === id)
    if (!a) {
      onChange(null, authorName)
      return
    }
    onChange(a.id, a.name)
  }

  return (
    <div className="space-y-2">
      <select
        value={authorId ?? ""}
        onChange={(e) => pick(e.target.value)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      >
        <option value="">— No linked author (type a byline below) —</option>
        {authors.map((a) => (
          <option key={a.id} value={a.id} disabled={!a.isActive}>
            {a.name}
            {!a.isActive ? " (inactive)" : ""}
          </option>
        ))}
      </select>
      <input
        value={authorName}
        onChange={(e) => onChange(authorId, e.target.value)}
        placeholder="Byline shown on the post"
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      {authorId && (
        <p className="text-xs text-muted-foreground">
          Linked to a profile page. Editing the name above only changes this post's byline text.
        </p>
      )}
    </div>
  )
}
