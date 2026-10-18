// app/(admin)/admin/blog/page.tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"
import type { BlogPost } from "@/src/services/blog"

export default function AdminBlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again to manage blog posts.")

      const res = await fetch("/api/admin/blog/posts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error(`Unable to load blog posts (${res.status}). Please try again.`)
      const data = await res.json()
      setPosts(Array.isArray(data.posts) ? data.posts : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load blog posts. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPosts()
  }, [loadPosts])

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return posts.filter((post) => {
      const matchesQuery = !query || [post.title, post.category ?? "", post.slug]
        .some((value) => value.toLowerCase().includes(query))
      const matchesStatus = statusFilter === "all" || post.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [posts, search, statusFilter])

  async function deletePost(id: string) {
    if (!confirm("Delete this post permanently? This action cannot be undone.")) return
    setBusyId(id)
    setError("")
    try {
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again to manage blog posts.")

      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error("The post could not be deleted. Please try again.")
      setPosts((current) => current.filter((post) => post.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "The post could not be deleted. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const publishedCount = posts.filter((post) => post.status === "published").length
  const draftCount = posts.filter((post) => post.status !== "published").length

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary to-secondary/90 p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Content workspace</p>
            <h1 className="mt-2 text-2xl font-heading font-bold sm:text-3xl">Blog posts</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Manage articles, check publishing status, and keep your content organized.</p>
          </div>
          <Link href="/admin/blog/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-secondary">
            <span aria-hidden className="mr-2 text-lg leading-none">+</span> New post
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">All posts</p>
          <p className="mt-1 text-2xl font-heading font-bold text-foreground">{posts.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Published</p>
          <p className="mt-1 text-2xl font-heading font-bold text-accent">{publishedCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Drafts and other statuses</p>
          <p className="mt-1 text-2xl font-heading font-bold text-foreground">{draftCount}</p>
        </div>
      </section>

      {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"><p>{error}</p><button type="button" onClick={() => void loadPosts()} className="min-h-9 rounded-lg border border-current/20 px-3 font-semibold hover:bg-destructive/5">Try again</button></div>}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Content library</h2>
            <p className="mt-1 text-sm text-muted-foreground">Showing {filteredPosts.length} of {posts.length} posts</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(200px,1fr)_170px]">
            <label className="sr-only" htmlFor="blog-search">Search blog posts</label>
            <input id="blog-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, category or slug" className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <label className="sr-only" htmlFor="blog-status">Filter by status</label>
            <select id="blog-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading blog posts"><div className="h-5 w-40 animate-pulse rounded bg-muted"/><div className="h-12 animate-pulse rounded-lg bg-muted/70"/><div className="h-12 animate-pulse rounded-lg bg-muted/70"/><div className="h-12 animate-pulse rounded-lg bg-muted/70"/></div>
        ) : filteredPosts.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xl" aria-hidden>✎</div>
            <h3 className="mt-3 font-semibold text-foreground">{posts.length === 0 ? "No posts yet" : "No matching posts"}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{posts.length === 0 ? "Create your first article to start building the blog." : "Try a different search term or status filter."}</p>
            {posts.length === 0 && <Link href="/admin/blog/new" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Create a post</Link>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-5 py-3 font-semibold">Article</th><th scope="col" className="px-4 py-3 font-semibold">Category</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredPosts.map((post) => <tr key={post.id} className="transition-colors hover:bg-muted/30">
                  <td className="max-w-[360px] px-5 py-4"><p className="truncate font-semibold text-foreground" title={post.title}>{post.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">/{post.slug}</p></td>
                  <td className="px-4 py-4 text-muted-foreground">{post.category || "Uncategorized"}</td>
                  <td className="px-4 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${post.status === "published" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}><span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${post.status === "published" ? "bg-accent" : "bg-muted-foreground"}`} aria-hidden/>{post.status}</span></td>
                  <td className="whitespace-nowrap px-5 py-4 text-right"><div className="inline-flex items-center gap-2"><Link href={`/admin/blog/${post.id}/edit`} className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">Edit</Link><button type="button" disabled={busyId === post.id} onClick={() => void deletePost(post.id)} className="inline-flex min-h-9 items-center rounded-lg border border-destructive/25 px-3 font-medium text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50">{busyId === post.id ? "Deleting..." : "Delete"}</button></div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
