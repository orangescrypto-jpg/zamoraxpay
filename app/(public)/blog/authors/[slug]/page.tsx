// app/(public)/blog/authors/[slug]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getAuthorBySlug } from "@/src/services/blogAuthors"
import { listPublishedPostsByAuthor } from "@/src/services/blogAuthorPosts"
import { formatDate } from "@/lib/utils"

export const revalidate = 3600

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const author = await getAuthorBySlug(slug)
  if (!author) return {}

  const description = author.bio ?? `Posts by ${author.name} on the ZamoraxPay blog.`
  const url = `${BASE}/blog/authors/${author.slug}`

  return {
    title: `${author.name} — ZamoraxPay Blog`,
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
    <div className="container max-w-3xl py-12">
      <div className="mb-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {author.photoUrl ? (
          <img src={author.photoUrl} alt={author.name} className="h-24 w-24 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-secondary text-3xl font-semibold text-secondary-foreground">
            {author.name.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">{author.name}</h1>
          {author.bio && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{author.bio}</p>}
        </div>
      </div>

      <h2 className="mb-6 text-lg font-heading font-bold text-secondary">
        Posts by {author.name} {posts.length > 0 && `(${posts.length})`}
      </h2>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published posts yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
              <div className="mb-2 aspect-[1200/630] overflow-hidden rounded-lg bg-secondary">
                <img
                  src={post.coverImageUrl || "/blog-fallback-cover.svg"}
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <h3 className="font-heading font-medium text-secondary group-hover:text-primary">{post.title}</h3>
              {post.publishedAt && (
                <time className="text-xs text-muted-foreground" dateTime={post.publishedAt}>
                  {formatDate(post.publishedAt)}
                </time>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
