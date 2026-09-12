// app/(public)/blog/[slug]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPostBySlug, getRelatedPosts } from "@/src/services/blog"
import { getSettingNumber } from "@/src/services/siteSettings"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { ShareButton } from "@/components/shared/ShareButton"
import { AdSenseSlot } from "@/components/shared/AdSenseSlot"

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  return {
    title: `${post.title} — ZamoraxPay Blog`,
    description: post.metaDescription ?? post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.metaDescription ?? post.excerpt ?? undefined,
      images: post.coverImageUrl ? [post.coverImageUrl] : ["/blog-fallback-cover.svg"],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const relatedCount = await getSettingNumber("related_post_count", 4)
  const relatedPosts = await getRelatedPosts(post, relatedCount)

  return (
    <div>
      <article className="container max-w-3xl py-12">
        {post.category && (
          <Link
            href={`/blog?category=${post.category}`}
            className="mb-2 inline-block text-xs font-medium uppercase tracking-wide text-primary hover:underline"
          >
            {post.category.replace(/-/g, " ")}
          </Link>
        )}
        <h1 className="mb-3 text-3xl font-heading font-bold text-secondary sm:text-4xl">{post.title}</h1>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {post.authorName && <span>{post.authorName}</span>}
          </div>
          <ShareButton
            title={post.title}
            text={post.excerpt ?? undefined}
            url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/blog/${post.slug}`}
          />
        </div>

        {post.coverImageUrl && (
          <div className="mb-8 aspect-[1200/630] overflow-hidden rounded-lg">
            <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" />
          </div>
        )}

        <MarkdownContent markdown={post.contentMarkdown} />

        <AdSenseSlot slotKey="blog_post" className="mt-10" />
      </article>

      {relatedPosts.length > 0 && (
        <section className="border-t border-border bg-bg py-12">
          <div className="container max-w-3xl">
            <h2 className="mb-6 text-xl font-heading font-bold text-secondary">Related posts</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {relatedPosts.map((related) => (
                <Link key={related.id} href={`/blog/${related.slug}`} className="group block">
                  <div className="mb-2 aspect-[1200/630] overflow-hidden rounded-lg bg-secondary">
                    <img
                      src={related.coverImageUrl || "/blog-fallback-cover.svg"}
                      alt={related.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <h3 className="font-heading font-medium text-secondary group-hover:text-primary">
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
