// app/(public)/blog/page.tsx
import Link from "next/link"
import type { Metadata } from "next"
import { listPublishedPostsPaginated } from "@/src/services/blog"
import { d1Query } from "@/lib/db"
import { formatDate, cn } from "@/lib/utils"

const POSTS_PER_PAGE = 30

export const metadata: Metadata = {
  title: "Blog — ZamoraxPay",
  description: "Guides, announcements, and updates from the ZamoraxPay team.",
}

export const revalidate = 3600

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const { category, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)

  const [{ posts, totalPages }, categoriesResult] = await Promise.all([
    listPublishedPostsPaginated(category, page, POSTS_PER_PAGE),
    d1Query("SELECT * FROM blog_categories ORDER BY sort_order"),
  ])
  const categories = categoriesResult.results ?? []
  const activeLabel = categories.find((c: any) => c.slug === category)?.label

  const buildPageHref = (p: number) => {
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return qs ? `/blog?${qs}` : "/blog"
  }

  return (
    <div className="container py-12">
      <h1 className="mb-2 text-3xl font-heading font-bold text-secondary">Blog</h1>
      <p className="mb-6 text-muted-foreground">
        {activeLabel ? `Posts in ${activeLabel}` : "Guides, announcements, and updates from the ZamoraxPay team."}
      </p>

      <div className="mb-10 flex flex-wrap gap-2">
        <Link
          href="/blog"
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            !category ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-secondary hover:border-primary",
          )}
        >
          All
        </Link>
        {categories.map((c: any) => (
          <Link
            key={c.slug}
            href={`/blog?category=${c.slug}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              category === c.slug
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-white text-secondary hover:border-primary",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
            <div className="mb-3 aspect-[1200/630] overflow-hidden rounded-lg bg-secondary">
              <img
                src={post.coverImageUrl || "/blog-fallback-cover.svg"}
                alt={post.title}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            </div>
            {post.category && (
              <span className="mb-1 inline-block text-xs font-medium uppercase tracking-wide text-primary">
                {post.category.replace(/-/g, " ")}
              </span>
            )}
            <h2 className="mb-1 text-lg font-heading font-semibold text-secondary group-hover:text-primary">
              {post.title}
            </h2>
            {post.excerpt && <p className="mb-2 text-sm text-muted-foreground">{post.excerpt}</p>}
            {post.publishedAt && (
              <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</p>
            )}
          </Link>
        ))}

        {posts.length === 0 && <p className="text-muted-foreground">No posts in this category yet.</p>}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Blog pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildPageHref(page - 1)}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-secondary hover:border-primary"
            >
              Previous
            </Link>
          )}

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildPageHref(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                p === page
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-white text-secondary hover:border-primary",
              )}
            >
              {p}
            </Link>
          ))}

          {page < totalPages && (
            <Link
              href={buildPageHref(page + 1)}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-secondary hover:border-primary"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
