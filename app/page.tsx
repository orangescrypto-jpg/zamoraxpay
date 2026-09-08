// app/page.tsx
import Link from "next/link"
import { listPublishedPosts } from "@/src/services/blog"
import { getSettingNumber } from "@/src/services/siteSettings"
import { d1Query } from "@/lib/db"
import { formatDate } from "@/lib/utils"

const SERVICES = [
  { href: "/services/airtime", label: "Airtime", desc: "All networks, instant delivery" },
  { href: "/services/data", label: "Data", desc: "Cheap bundles, all networks" },
  { href: "/services/cable", label: "Cable TV", desc: "DSTV, GOtv, StarTimes" },
  { href: "/services/electricity", label: "Electricity", desc: "Prepaid & postpaid tokens" },
  { href: "/services/exam-pin", label: "Exam PINs", desc: "WAEC, NECO, JAMB" },
  { href: "/services/betting", label: "Betting", desc: "Fund your sportsbook wallet" },
]

export const revalidate = 900 // 15 minutes — homepage content doesn't need to be second-fresh

export default async function HomePage() {
  const [postCount, allPosts, categoriesResult] = await Promise.all([
    getSettingNumber("homepage_post_count", 6),
    listPublishedPosts(),
    d1Query("SELECT * FROM blog_categories ORDER BY sort_order"),
  ])

  const latestPosts = allPosts.slice(0, postCount)
  const categories = categoriesResult.results ?? []

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />
        <div className="container relative py-20 text-center sm:py-28">
          <span className="mb-4 inline-block rounded-full bg-primary/20 px-4 py-1 text-xs font-medium text-primary">
            Reliable by design: 4 providers, automatic fallback
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-heading font-bold text-white sm:text-5xl lg:text-6xl">
            Airtime, data, and bills, all from one fast, reliable wallet
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
            Every purchase routes through multiple providers automatically, so your transaction goes through even
            when one is down. No more failed data bundles.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className="w-full rounded-md border border-white/20 px-8 py-3 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services grid ────────────────────────────────────── */}
      <section className="container py-16">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">Everything in one place</h2>
          <p className="mt-2 text-muted-foreground">Six services, one wallet, one login.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SERVICES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-lg border border-border bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
            >
              <h3 className="font-heading font-semibold text-secondary">{s.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Latest from the blog ─────────────────────────────── */}
      {latestPosts.length > 0 && (
        <section className="border-t border-border bg-bg py-16">
          <div className="container">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">From the blog</h2>
                <p className="mt-2 text-muted-foreground">Guides, updates, and tips.</p>
              </div>
              <Link href="/blog" className="hidden text-sm font-medium text-primary hover:underline sm:block">
                View all posts →
              </Link>
            </div>

            {categories.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {categories.map((c: any) => (
                  <Link
                    key={c.slug}
                    href={`/blog?category=${c.slug}`}
                    className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-secondary hover:border-primary hover:text-primary"
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {latestPosts.map((post) => (
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
                  <h3 className="mb-1 font-heading font-semibold text-secondary group-hover:text-primary">
                    {post.title}
                  </h3>
                  {post.excerpt && <p className="mb-2 text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>}
                  {post.publishedAt && (
                    <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</p>
                  )}
                </Link>
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/blog" className="text-sm font-medium text-primary hover:underline">
                View all posts →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <section className="border-t border-border py-16">
        <div className="container text-center">
          <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">Ready to get started?</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Sign up in under a minute and fund your wallet to make your first purchase.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create free account
          </Link>
        </div>
      </section>
    </div>
  )
}
