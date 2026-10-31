// app/(public)/blog/[slug]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPostBySlug, getRelatedPosts } from "@/src/services/blog"
import { getSettingNumber } from "@/src/services/siteSettings"
import { extractHeadings } from "@/lib/simpleMarkdown"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { TableOfContents } from "@/components/shared/TableOfContents"
import { ShareButton } from "@/components/shared/ShareButton"
import { AdSenseSlot } from "@/components/shared/AdSenseSlot"
import { AuthorBox } from "@/components/shared/AuthorBox"
import { BlogComments } from "@/components/shared/BlogComments"
import { Breadcrumbs } from "@/components/shared/Breadcrumbs"
import { ReadingProgress } from "@/components/shared/ReadingProgress"
import { formatDate } from "@/lib/utils"
import { estimateReadingTime, formatReadingTime, wordCount } from "@/lib/readingTime"

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

function absolute(url: string): string {
  return url.startsWith("http") ? url : `${BASE}${url.startsWith("/") ? "" : "/"}${url}`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  const description = post.metaDescription ?? post.excerpt ?? undefined
  const image = absolute(post.coverImageUrl || "/blog-fallback-cover.svg")
  const url = `${BASE}/blog/${post.slug}`
  const categoryLabel = post.category ? post.category.replace(/-/g, " ") : undefined
  const keywords = [
    "ZamoraxPay",
    "airtime",
    "data",
    "Nigeria",
    categoryLabel,
    post.authorName,
  ].filter(Boolean) as string[]

  return {
    title: `${post.title} - ZamoraxPay Blog`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: post.title }],
      publishedTime: post.publishedAt ?? undefined,
      authors: post.authorName ? [post.authorName] : undefined,
      siteName: "ZamoraxPay",
      locale: "en_NG",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [image],
    },
    keywords,
    authors: post.authorName ? [{ name: post.authorName }] : undefined,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const relatedCount = await getSettingNumber("related_post_count", 4)
  const relatedPosts = await getRelatedPosts(post, relatedCount)
  const headings = extractHeadings(post.contentMarkdown)
  const readingMinutes = estimateReadingTime(post.contentMarkdown)
  const words = wordCount(post.contentMarkdown)
  const categoryLabel = post.category ? post.category.replace(/-/g, " ") : undefined

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    image: [
      absolute(post.coverImageUrl || "/blog-fallback-cover.svg"),
    ],
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.publishedAt ?? undefined,
    author: post.authorName
      ? { "@type": "Person", name: post.authorName, url: post.authorSlug ? `${BASE}/blog/authors/${post.authorSlug}` : undefined }
      : { "@type": "Organization", name: "ZamoraxPay Team" },
    publisher: {
      "@type": "Organization",
      name: "ZamoraxPay",
      logo: { "@type": "ImageObject", url: `${BASE}/icon-512.png`, width: 512, height: 512 },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/blog/${post.slug}` },
    articleSection: categoryLabel,
    keywords: [categoryLabel, "Nigeria", "ZamoraxPay"].filter(Boolean).join(", "),
    wordCount: words,
    inLanguage: "en-NG",
  }

  return (
    <div className="bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          ...(categoryLabel ? [{ label: categoryLabel, href: `/blog?category=${post.category}` }] : []),
          { label: post.title },
        ]}
      />
      <article className="container py-6 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-soft">
            <Link href="/blog" className="font-medium text-primary hover:underline">← All articles</Link>
            <span>{formatReadingTime(readingMinutes)} · {words.toLocaleString()} words</span>
          </div>

          {post.category && (
            <Link
              href={`/blog?category=${post.category}`}
              className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary hover:bg-primary/15"
            >
              {categoryLabel}
            </Link>
          )}
          <h1 className="mb-4 text-3xl font-heading font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">{post.title}</h1>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-secondary">{post.authorName || "ZamoraxPay Team"}</span>
              {post.publishedAt && (
                <>
                  <span aria-hidden>·</span>
                  <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                </>
              )}
              <span aria-hidden>·</span>
              <span>{formatReadingTime(readingMinutes)}</span>
            </div>
            <ShareButton
              title={post.title}
              text={post.excerpt ?? undefined}
              url={`${BASE}/blog/${post.slug}`}
            />
          </div>

          {post.coverImageUrl && (
            <div className="mb-8 aspect-[1200/630] overflow-hidden rounded-2xl border border-border bg-muted shadow-soft">
              <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" fetchPriority="high" />
            </div>
          )}
        </div>

        {/* Two-column layout on desktop: sticky TOC + article body.
            On mobile the TOC collapses into a button-activated card
            (handled inside the TableOfContents component). */}
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            <MarkdownContent markdown={post.contentMarkdown} />
            <AdSenseSlot slotKey="blog_post" className="mt-12" />

            <div className="mt-10">
              <AuthorBox
                authorName={post.authorName}
                authorSlug={post.authorSlug}
                authorPhotoUrl={post.authorPhotoUrl}
                authorBio={post.authorBio}
              />
            </div>

            <BlogComments postSlug={post.slug} />
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <TableOfContents headings={headings} />
            </div>
          </aside>
        </div>
      </article>

      {relatedPosts.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12">
          <div className="container max-w-5xl">
            <h2 className="mb-6 text-xl font-heading font-bold text-secondary">Related posts</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {relatedPosts.map((related) => {
                const relReading = estimateReadingTime(related.excerpt ?? "")
                return (
                  <Link key={related.id} href={`/blog/${related.slug}`} className="group block overflow-hidden rounded-xl border border-border bg-card p-3 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card">
                    <div className="mb-3 aspect-[1200/630] overflow-hidden rounded-lg bg-secondary">
                      <img
                        src={related.coverImageUrl || "/blog-fallback-cover.svg"}
                        alt={related.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy"
                      />
                    </div>
                    <h3 className="px-1 pb-1 font-heading font-semibold text-foreground group-hover:text-primary">
                      {related.title}
                    </h3>
                    {relReading > 0 && (
                      <p className="px-1 text-xs text-muted-foreground">{formatReadingTime(relReading)}</p>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
