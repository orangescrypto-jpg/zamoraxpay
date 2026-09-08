// app/(admin)/admin/blog/[id]/edit/page.tsx
"use client"

import { useEffect, useState, use } from "react"
import { BlogPostForm } from "@/components/admin/BlogPostForm"
import { createClient } from "@/src/services/providers/supabase/client"

export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [initial, setInitial] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/blog/posts", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      const post = (data.posts ?? []).find((p: any) => p.id === id)
      if (post) {
        setInitial({
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt ?? "",
          contentMarkdown: post.contentMarkdown,
          coverImageUrl: post.coverImageUrl ?? "",
          category: post.category ?? "guides",
          authorName: post.authorName ?? "",
          metaDescription: post.metaDescription ?? "",
          status: post.status,
        })
      }
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!initial) return <div className="p-6 text-muted-foreground">Post not found.</div>

  return <BlogPostForm postId={id} initial={initial} />
}
