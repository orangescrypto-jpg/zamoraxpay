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
import { formatDate } from "@/lib/utils"

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

  return {
    title: `${post.title} - ZamoraxPay Blog`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description,
      images: [{ url: image }],
      publishedTime: post.publishedAt ?? undefined,
      authors: post.authorName ? [post.authorName] : undefined,
      siteName: "ZamoraxPay",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [image],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const relatedCount = await getSettingNumber("related_post_count", 4)
  const relatedPosts = await getRelatedPosts(post, relatedCount)
  const headings = extractHeadings(post.contentMarkdown)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    image: absolute(post.coverImageUrl || "/blog-fallback-cover.svg"),
    datePublished: post.publishedAt ?? undefined,
    author: { "@type": "Organization", name: post.authorName || "ZamoraxPay Team" },
    publisher: { "@type": "Organization", name: "ZamoraxPay" },
    mainEntityOfPage: `${BASE}/blog/${post.slug}`,
  }

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="container max-w-4xl py-8 sm:py-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground"><Link href="/blog" className="font-medium text-primary hover:underline">← All articles</Link><span>Reading progress is shown at the top of the page</span></div>
        {post.category && (
          <Link
            href={`/blog?category=${post.category}`}
            className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary hover:bg-primary/15"
          >
            {post.category.replace(/-/g, " ")}
          </Link>
        )}
        <h1 className="mb-4 text-3xl font-heading font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">{post.title}</h1>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{post.authorName || "ZamoraxPay Team"}</span>
            {post.publishedAt && (
              <>
                <span aria-hidden>·</span>
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              </>
            )}
          </div>
          <ShareButton
            title={post.title}
            text={post.excerpt ?? undefined}
            url={`${BASE}/blog/${post.slug}`}
          />
        </div>

        {post.coverImageUrl && (
          <div className="mb-8 aspect-[1200/630] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
            <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" fetchPriority="high" />
          </div>
        )}

        <TableOfContents headings={headings} />

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
      </article>

      {relatedPosts.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12">
          <div className="container max-w-3xl">
            <h2 className="mb-6 text-xl font-heading font-bold text-secondary">Related posts</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {relatedPosts.map((related) => (
                <Link key={related.id} href={`/blog/${related.slug}`} className="group block overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <div className="mb-3 aspect-[1200/630] overflow-hidden rounded-xl bg-secondary">
                    <img
                      src={related.coverImageUrl || "/blog-fallback-cover.svg"}
                      alt={related.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy"
                    />
                  </div>
                  <h3 className="px-1 pb-1 font-heading font-semibold text-foreground group-hover:text-primary">
                    {related.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
