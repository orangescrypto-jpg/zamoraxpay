// app/(public)/blog/authors/[slug]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getAuthorBySlug } from "@/src/services/blogAuthors"
import { listPublishedPostsByAuthor } from "@/src/services/blogAuthorPosts"
import { BlogPostSearch } from "@/components/shared/BlogPostSearch"
import { Breadcrumbs } from "@/components/shared/Breadcrumbs"

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const author = await getAuthorBySlug(slug)
  if (!author) return {}

  const description = author.bio ?? `Posts by ${author.name} on the ZamoraxPay blog.`
  const url = `${BASE}/blog/authors/${author.slug}`

  return {
    title: `${author.name} - ZamoraxPay Blog`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", url, title: author.name, description },
  }
}

export default async function AuthorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const author = await getAuthorBySlug(slug)
  if (!author) notFound()

  const posts = await listPublishedPostsByAuthor(author.id)

  return (
    <div className="bg-background">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: author.name },
        ]}
      />
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
        <div className="container relative py-10 sm:py-14">
          <div className="mb-2">
            <Link href="/blog" className="text-xs font-semibold text-primary hover:underline">← Back to blog</Link>
          </div>
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            {author.photoUrl ? (
              <img src={author.photoUrl} alt={author.name} className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-white/20" />
            ) : (
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white/10 text-3xl font-heading font-semibold text-white ring-2 ring-white/20">
                {author.name.charAt(0)}
              </div>
            )}
            <div className="max-w-xl">
              <span className="zpx-eyebrow text-primary">Author</span>
              <h1 className="mt-1 text-2xl font-heading font-bold text-white sm:text-3xl">{author.name}</h1>
              {author.bio && <p className="mt-2 text-sm leading-relaxed text-white/70">{author.bio}</p>}
            </div>
          </div>
        </div>
      </section>
      <div className="container max-w-3xl py-10 sm:py-14">
        <h2 className="mb-6 text-lg font-heading font-bold text-secondary">
          Posts by {author.name} {posts.length > 0 && `(${posts.length})`}
        </h2>

        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published posts yet.</p>
        ) : (
          <BlogPostSearch posts={posts.map((post) => ({ id: post.slug, slug: post.slug, title: post.title, excerpt: post.excerpt, publishedAt: post.publishedAt, coverImageUrl: post.coverImageUrl }))} />
        )}
      </div>
    </div>
  )
}
