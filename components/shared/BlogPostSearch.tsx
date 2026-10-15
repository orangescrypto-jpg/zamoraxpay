"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"

type BlogPostCard = { id: string | number; slug: string; title: string; excerpt?: string | null; category?: string | null; publishedAt?: string | null; coverImageUrl?: string | null }

export function BlogPostSearch({ posts }: { posts: BlogPostCard[] }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("newest")
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = posts.filter((post) => !needle || [post.title, post.excerpt, post.category].some((value) => value?.toLowerCase().includes(needle)))
    if (sort === "title") filtered.sort((a, b) => a.title.localeCompare(b.title))
    if (sort === "oldest") filtered.sort((a, b) => (a.publishedAt || "").localeCompare(b.publishedAt || ""))
    if (sort === "newest") filtered.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
    return filtered
  }, [posts, query, sort])

  return <>
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-3 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Search articles on this page</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search these articles..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="rounded p-1 text-muted-foreground hover:text-secondary"><X className="h-4 w-4" /></button>}
      </label>
      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">Sort
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-secondary outline-none focus:border-primary"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A to Z</option></select>
      </label>
    </div>
    <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">{results.length} of {posts.length} loaded article{posts.length === 1 ? "" : "s"}</p>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((post) => <Link key={post.id} href={`/blog/${post.slug}`} className="group block overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
        <div className="mb-3 aspect-[1200/630] overflow-hidden rounded-xl bg-secondary"><img src={post.coverImageUrl || "/blog-fallback-cover.svg"} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /></div>
        {post.category && <span className="mb-1 inline-block text-xs font-medium uppercase tracking-wide text-primary">{post.category.replace(/-/g, " ")}</span>}
        <h2 className="mb-1 px-1 text-lg font-heading font-semibold text-secondary group-hover:text-primary">{post.title}</h2>
        {post.excerpt && <p className="mb-2 px-1 text-sm leading-5 text-muted-foreground line-clamp-2">{post.excerpt}</p>}
        {post.publishedAt && <time className="px-1 text-xs text-muted-foreground" dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })}</time>}
      </Link>)}
      {results.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center"><Search className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium text-secondary">No matching articles found</p><p className="mt-1 text-xs text-muted-foreground">Try a different title, topic or category.</p><button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-semibold text-primary hover:underline">Clear search</button></div>}
    </div>
  </>
}
