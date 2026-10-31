// app/(public)/blog/page.tsx
import Link from "next/link"
import type { Metadata } from "next"
import { listPublishedPostsPaginated } from "@/src/services/blog"
import { d1Query } from "@/lib/db"
import { cn } from "@/lib/utils"
import { BlogPostSearch } from "@/components/shared/BlogPostSearch"
import { Breadcrumbs } from "@/components/shared/Breadcrumbs"

const POSTS_PER_PAGE = 30
const CATEGORY_POSTS_PER_PAGE = 20
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

// Short intro shown on category pages (add more slugs as needed).
// Falls back to a generic line for categories not listed here.
const CATEGORY_INTROS: Record<string, string> = {
  guides:
    "Step-by-step guides on buying airtime and data, paying bills, and getting the most out of your ZamoraxPay wallet.",
  "tech-news": "Broader technology news relevant to ZamoraxPay users.",
  "network-news": "Airtime/data price changes, network outages, and provider updates.",
  promotions: "Discounts, cashback campaigns, and limited-time offers.",
  announcements: "Product updates, new features, and platform news.",
  jobs: "Job vacancies, graduate programmes, internships, and career opportunities. Check eligibility and application deadlines before applying.",
  scholarships: "Scholarships, bursaries, and education funding opportunities for students. Review eligibility, funding details, and official application instructions.",
  grants: "Grant opportunities and funding calls. Check eligibility, deadlines, and official application instructions before applying.",
  internships: "Internship openings and placement programmes. Check eligibility and application deadlines before applying.",
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}): Promise<Metadata> {
  const { category, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)

  const label = category ? category.replace(/-/g, " ") : null
  const title = label
    ? `${label.charAt(0).toUpperCase()}${label.slice(1)} - ZamoraxPay Blog${page > 1 ? ` (Page ${page})` : ""}`
    : `Blog - ZamoraxPay${page > 1 ? ` (Page ${page})` : ""}`
  const description = "Guides, announcements, and updates from the ZamoraxPay team."

  const params = new URLSearchParams()
  if (category) params.set("category", category)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  const canonical = `${BASE}/blog${qs ? `?${qs}` : ""}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      images: [{ url: "/blog-fallback-cover.svg" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/blog-fallback-cover.svg"],
    },
  }
}

export const revalidate = 3600

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const { category, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)

  const pageSize = category ? CATEGORY_POSTS_PER_PAGE : POSTS_PER_PAGE
  const [{ posts, totalPages }, categoriesResult] = await Promise.all([
    listPublishedPostsPaginated(category, page, pageSize),
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

  const intro = category
    ? CATEGORY_INTROS[category] ??
      (activeLabel ? `Articles and guides about ${activeLabel.toLowerCase()} from the ZamoraxPay team.` : null)
    : "Guides, announcements, and updates from the ZamoraxPay team."

  const featured = posts[0]

  return (
    <div className="bg-background">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          ...(activeLabel ? [{ label: activeLabel }] : []),
        ]}
      />
      {/* Blog hero header */}
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="container relative py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <span className="zpx-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              ZamoraxPay Journal
            </span>
            <h1 className="mt-4 text-3xl font-heading font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">{activeLabel ?? "Guides, updates and useful reads"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">{intro}</p>
          </div>
        </div>
      </section>

      <div className="container py-10 sm:py-14">
        {featured && !category && (
          <section className="mb-10 grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-card md:grid-cols-[1.15fr_0.85fr]">
            <Link href={`/blog/${featured.slug}`} className="group relative min-h-[220px] overflow-hidden bg-secondary sm:min-h-[280px] md:min-h-[320px]">
              <img src={featured.coverImageUrl || "/blog-fallback-cover.svg"} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary shadow-sm">Featured</span>
            </Link>
            <div className="flex flex-col justify-center p-5 sm:p-7 lg:p-8">
              {featured.category && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{featured.category.replace(/-/g, " ")}</p>}
              <h2 className="mt-2 text-xl font-heading font-bold tracking-tight text-foreground sm:text-2xl">{featured.title}</h2>
              {featured.excerpt && <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{featured.excerpt}</p>}
              <Link href={`/blog/${featured.slug}`} className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110">Read article <span aria-hidden>→</span></Link>
            </div>
          </section>
        )}

        {/* Category filter chips */}
        <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-border bg-white p-3 shadow-soft sm:p-4">
          <Link
            href="/blog"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              !category ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-secondary hover:border-primary hover:text-primary",
            )}
          >
            All
          </Link>
          {categories.map((c: any) => (
            <Link
              key={c.slug}
              href={`/blog?category=${c.slug}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                category === c.slug
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-white text-secondary hover:border-primary hover:text-primary",
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>

        {category && posts.length > 0 && (
          <nav aria-label="Table of contents" className="mb-10 rounded-xl border border-border bg-white p-5 shadow-soft">
            <p className="mb-3 text-sm font-semibold text-secondary">
              In this category{totalPages > 1 ? ` (page ${page} of ${totalPages})` : ""}
            </p>
            <ol className="grid list-decimal gap-x-6 gap-y-1.5 pl-5 sm:grid-cols-2">
              {posts.map((post) => (
                <li key={post.id} className="text-sm">
                  <Link href={`/blog/${post.slug}`} className="text-secondary hover:text-primary hover:underline">
                    {post.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mb-5 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <span className="zpx-eyebrow">Latest reads</span>
            <h2 className="mt-1 text-xl font-heading font-bold text-secondary sm:text-2xl">{activeLabel ?? "Latest from ZamoraxPay"}</h2>
          </div>
          <span className="text-xs text-muted-foreground">{posts.length} article{posts.length === 1 ? "" : "s"} shown</span>
        </div>

        <BlogPostSearch posts={posts.map((post: any) => ({ id: post.id, slug: post.slug, title: post.title, excerpt: post.excerpt, category: post.category, publishedAt: post.publishedAt, coverImageUrl: post.coverImageUrl }))} />

        {totalPages > 1 && (
          <nav aria-label="Blog pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(page - 1)}
                rel="prev"
                className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Previous
              </Link>
            )}

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(page - 2, totalPages - 4)) + i).map((p) => (
              <Link
                key={p}
                href={buildPageHref(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                  p === page
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary hover:text-primary",
                )}
              >
                {p}
              </Link>
            ))}

            {page < totalPages && (
              <Link
                href={buildPageHref(page + 1)}
                rel="next"
                className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
