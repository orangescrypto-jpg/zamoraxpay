// app/page.tsx
import Link from "next/link"
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  GraduationCap,
  Globe2,
  ShieldCheck,
  Smartphone,
  Ticket,
  Tv,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { listLatestPostsByCategories } from "@/src/services/blog"
import { formatDate } from "@/lib/utils"

const SERVICES: { href: string; label: string; desc: string; icon: LucideIcon; iconClass: string }[] = [
  { href: "/services/airtime", label: "Airtime", desc: "All networks, instant delivery", icon: Smartphone, iconClass: "bg-blue-50 text-blue-600" },
  { href: "/services/data", label: "Data", desc: "Cheap bundles, all networks", icon: Wifi, iconClass: "bg-violet-50 text-violet-600" },
  { href: "/services/cable", label: "Cable TV", desc: "DSTV, GOtv, StarTimes", icon: Tv, iconClass: "bg-orange-50 text-orange-600" },
  { href: "/services/electricity", label: "Electricity", desc: "Prepaid & postpaid tokens", icon: Zap, iconClass: "bg-amber-50 text-amber-600" },
  { href: "/services/exam-pin", label: "Exam PINs", desc: "WAEC, NECO, JAMB", icon: GraduationCap, iconClass: "bg-emerald-50 text-emerald-600" },
  { href: "/services/airtime-to-cash", label: "Airtime to Cash", desc: "Convert airtime to wallet funds", icon: Banknote, iconClass: "bg-lime-50 text-lime-600" },
  { href: "/services/epin", label: "Buy ePIN", desc: "Instant PINs for redemption", icon: Ticket, iconClass: "bg-fuchsia-50 text-fuchsia-600" },
  { href: "/services/bulk-airtime", label: "Bulk Airtime", desc: "Send airtime to many numbers at once", icon: Users, iconClass: "bg-sky-50 text-sky-600" },
  { href: "/services/bulk-data", label: "Bulk Data", desc: "Send data to many numbers at once", icon: Users, iconClass: "bg-indigo-50 text-indigo-600" },
  { href: "/services/international-topup", label: "International Airtime & Data", desc: "Top up a phone number in another country", icon: Globe2, iconClass: "bg-cyan-50 text-cyan-600" },
]

const REWARDS = [
  { icon: "💸", label: "Cashback", desc: "Get cashback on eligible purchases and move it to your wallet whenever you like." },
  { icon: "🤝", label: "Referral bonus", desc: "Invite friends to ZamoraxPay and receive a bonus when they make their first purchase." },
  { icon: "🔥", label: "Daily check-in streak", desc: "Check in daily to build a streak and earn extra wallet credit for staying active." },
  { icon: "🎡", label: "Reward Spins", desc: "Use your reward spins to earn wallet credit, airtime and data vouchers, and purchase discounts." },
]

const STEPS = [
  { n: "1", title: "Create your account", desc: "Sign up with your email and phone number. It takes less than a minute and costs nothing." },
  { n: "2", title: "Fund your wallet", desc: "Add money securely with Korapay. Your balance is ready to spend as soon as the payment clears." },
  { n: "3", title: "Choose what to buy", desc: "Pick airtime, data, cable TV, electricity or an exam PIN, enter the details, and confirm." },
  { n: "4", title: "Get it delivered", desc: "Your order goes to the best available provider. If one is down, the next takes over automatically." },
]

const TRUST = [
  { title: "Multiple providers", desc: "Orders are routed through several independent providers, so one outage does not stop your purchase." },
  { title: "Automatic refunds", desc: "If a purchase fails after every provider has been tried, your money returns to your wallet by itself." },
  { title: "Clear records", desc: "Every transaction has a reference and sits in your history, so you always know what you paid for." },
  { title: "Real support", desc: "Reach a real person by email or phone if something looks wrong. Details are on our contact page." },
]

// The 5 featured homepage categories, in display order — mirrors the
// nav dropdown (components/layout/Header.tsx) and the sort_order set
// in migrations/2026-09-add-tech-news-category.sql. Each gets its own
// magazine-style row on the homepage.
const HOMEPAGE_BLOG_CATEGORIES = [
  { slug: "tech-news", label: "Tech News" },
  { slug: "guides", label: "Guides" },
  { slug: "network-news", label: "Network News" },
  { slug: "promotions", label: "Promotions" },
  { slug: "announcements", label: "Announcements" },
]

const HOMEPAGE_POSTS_PER_CATEGORY = 10

export const revalidate = 900 // 15 minutes — homepage content doesn't need to be second-fresh

export default async function HomePage() {
  const postsByCategory = await listLatestPostsByCategories(
    HOMEPAGE_BLOG_CATEGORIES.map((c) => c.slug),
    HOMEPAGE_POSTS_PER_CATEGORY,
  )

  const categorySections = HOMEPAGE_BLOG_CATEGORIES.filter((c) => postsByCategory[c.slug]?.length)

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />
        <div className="container relative py-20 text-center sm:py-28">
          <h1 className="mx-auto max-w-3xl text-4xl font-heading font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Airtime, data, and bills, all from one fast, reliable wallet
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
            Built for reliability. Transactions go through fast, every time, with instant delivery on airtime,
            data, and bills. No more failed purchases wasting your money.
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
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/55">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-accent" /> Fast delivery</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-accent" /> Secure wallet</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-accent" /> Multiple providers</span>
          </div>
        </div>
      </section>

      {/* ── Services grid ────────────────────────────────────── */}
      <section className="container py-16 sm:py-20">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pay in seconds</p>
            <h2 className="mt-1 text-2xl font-heading font-bold tracking-tight text-secondary sm:text-3xl">Everything in one place</h2>
            <p className="mt-2 text-muted-foreground">All your services, one wallet, one login.</p>
          </div>
          <span className="hidden text-xs font-medium text-muted-foreground sm:block">Choose a service to get started</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SERVICES.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group relative overflow-hidden rounded-2xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_14px_30px_-18px_rgba(15,30,77,0.35)] sm:p-5"
              >
                <span className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${s.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-heading text-sm font-semibold text-secondary sm:text-base">{s.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground sm:text-sm">{s.desc}</p>
                <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="border-t border-border py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">How ZamoraxPay works</h2>
            <p className="mt-2 text-muted-foreground">Four simple steps from sign up to delivery.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                  {step.n}
                </div>
                <h3 className="font-heading font-semibold text-secondary">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why ZamoraxPay ───────────────────────────────────── */}
      <section className="border-t border-border bg-bg py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">Why people trust ZamoraxPay</h2>
            <p className="mt-2 mx-auto max-w-2xl text-muted-foreground">
              We built ZamoraxPay after seeing too many failed top-ups and slow refunds. Here is how we try to do better.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t, i) => (
              <div key={t.title} className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary">
                  {i === 0 ? <Zap className="h-5 w-5" /> : i === 1 ? <ShieldCheck className="h-5 w-5" /> : i === 2 ? <CheckCircle2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </div>
                <h3 className="font-heading font-semibold text-secondary">{t.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Rewards ──────────────────────────────────────────── */}
      <section className="border-t border-border py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">Get rewarded for every purchase</h2>
            <p className="mt-2 text-muted-foreground">
              Cashback, referral bonuses, daily streaks, and prizes, all credited to your ZamoraxPay wallet.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {REWARDS.map((r) => (
              <div key={r.label} className="rounded-lg border border-border bg-white p-5">
                <div className="mb-2 text-2xl" aria-hidden="true">{r.icon}</div>
                <h3 className="font-heading font-semibold text-secondary">{r.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/signup"
              className="inline-block rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Create free account to start earning
            </Link>
          </div>
        </div>
      </section>

      {/* ── From the blog — one magazine-style row per category ─ */}
      {categorySections.length > 0 && (
        <section className="border-t border-border bg-bg py-16">
          <div className="container">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-heading font-bold text-secondary sm:text-3xl">From the blog</h2>
                <p className="mt-2 text-muted-foreground">Guides, updates, and tips.</p>
              </div>
              <Link href="/blog" className="hidden text-sm font-medium text-primary hover:underline sm:block">
                View all posts →
              </Link>
            </div>

            <div className="space-y-14">
              {categorySections.map((cat) => {
                const posts = postsByCategory[cat.slug] ?? []
                return (
                  <div key={cat.slug}>
                    <div className="mb-5 flex items-end justify-between">
                      <h3 className="text-xl font-heading font-bold text-secondary">{cat.label}</h3>
                      <Link
                        href={`/blog?category=${cat.slug}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        See more →
                      </Link>
                    </div>

                    {posts.length > 0 && (
                      <div className="space-y-6">
                        {/* Featured post */}
                        <Link href={`/blog/${posts[0].slug}`} className="group block">
                          <div className="mb-4 aspect-[1200/630] overflow-hidden rounded-xl bg-secondary">
                            <img
                              src={posts[0].coverImageUrl || "/blog-fallback-cover.svg"}
                              alt={posts[0].title}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                          <h4 className="mb-1 text-lg font-heading font-semibold text-secondary group-hover:text-primary sm:text-xl">
                            {posts[0].title}
                          </h4>
                          {posts[0].excerpt && (
                            <p className="mb-2 text-sm text-muted-foreground line-clamp-2">{posts[0].excerpt}</p>
                          )}
                          {posts[0].publishedAt && (
                            <p className="text-xs text-muted-foreground">{formatDate(posts[0].publishedAt)}</p>
                          )}
                        </Link>

                        {/* Remaining posts as a list */}
                        {posts.length > 1 && (
                          <div className="divide-y divide-border rounded-xl border border-border">
                            {posts.slice(1).map((post) => (
                              <Link
                                key={post.id}
                                href={`/blog/${post.slug}`}
                                className="group flex items-center gap-4 p-4"
                              >
                                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-secondary sm:h-20 sm:w-28">
                                  <img
                                    src={post.coverImageUrl || "/blog-fallback-cover.svg"}
                                    alt={post.title}
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="mb-1 font-heading font-semibold text-secondary group-hover:text-primary line-clamp-2">
                                    {post.title}
                                  </h4>
                                  {post.publishedAt && (
                                    <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</p>
                                  )}
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-10 text-center sm:hidden">
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
