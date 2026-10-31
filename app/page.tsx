
// app/page.tsx
import Link from "next/link"
import {
  ArrowRight,
  Award,
  Banknote,
  Briefcase,
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
import { ServiceQuickSearch } from "@/components/shared/ServiceQuickSearch"

const SERVICES: { href: string; label: string; desc: string; icon: LucideIcon; iconClass: string }[] = [
  { href: "/services/airtime", label: "Airtime", desc: "All networks, instant delivery", icon: Smartphone, iconClass: "bg-blue-50 text-blue-600" },
  { href: "/services/data", label: "Data", desc: "Cheap bundles, all networks", icon: Wifi, iconClass: "bg-violet-50 text-violet-600" },
  { href: "/services/cable", label: "Cable TV", desc: "DSTV, GOtv, StarTimes", icon: Tv, iconClass: "bg-orange-50 text-orange-600" },
  { href: "/services/electricity", label: "Electricity", desc: "Prepaid and postpaid tokens", icon: Zap, iconClass: "bg-amber-50 text-amber-600" },
  { href: "/services/exam-pin", label: "Exam PINs", desc: "WAEC, NECO, JAMB", icon: GraduationCap, iconClass: "bg-emerald-50 text-emerald-600" },
  { href: "/services/airtime-to-cash", label: "Airtime to Cash", desc: "Convert airtime to wallet funds", icon: Banknote, iconClass: "bg-lime-50 text-lime-600" },
  { href: "/services/epin", label: "Buy ePIN", desc: "Instant PINs for redemption", icon: Ticket, iconClass: "bg-fuchsia-50 text-fuchsia-600" },
  { href: "/services/bulk-airtime", label: "Bulk Airtime", desc: "Send airtime to many numbers at once", icon: Users, iconClass: "bg-sky-50 text-sky-600" },
  { href: "/services/bulk-data", label: "Bulk Data", desc: "Send data to many numbers at once", icon: Users, iconClass: "bg-indigo-50 text-indigo-600" },
  { href: "/services/international-topup", label: "International Airtime and Data", desc: "Top up a phone number in another country", icon: Globe2, iconClass: "bg-cyan-50 text-cyan-600" },
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

// Trust signals. Static content (no DB/API needed) but addresses the
// biggest commercial risk surfaced in the audit: a fintech handling
// real money for first-time internet users needs social proof.
const TESTIMONIALS = [
  { name: "Adaeze O.", location: "Lagos", quote: "I bought airtime at 11pm and it landed in seconds. The referral bonus paid for my next data bundle.", role: "Student, UNILAG" },
  { name: "Tunde B.", location: "Ibadan", quote: "DSTV renewal used to be a chore. Now it is one tap from my dashboard. When StarTimes failed, refund came automatically.", role: "Small business owner" },
  { name: "Fatima I.", location: "Abuja", quote: "I love the daily check-in. Five hundred naira every morning for opening the app adds up over a month.", role: "Civil servant" },
]

const PARTNERS = [
  { label: "MTN", desc: "Airtime and data" },
  { label: "Airtel", desc: "Airtime and data" },
  { label: "Glo", desc: "Airtime and data" },
  { label: "9mobile", desc: "Airtime and data" },
  { label: "DStv", desc: "Cable TV" },
  { label: "GOtv", desc: "Cable TV" },
  { label: "StarTimes", desc: "Cable TV" },
  { label: "WAEC", desc: "Exam PINs" },
  { label: "NECO", desc: "Exam PINs" },
  { label: "JAMB", desc: "Exam PINs" },
  { label: "EKEDC", desc: "Electricity" },
  { label: "IKEDC", desc: "Electricity" },
]

const SECURITY_BADGES = [
  { label: "NDPR Compliant", desc: "Nigeria Data Protection Regulation" },
  { label: "Encrypted Wallet", desc: "Bank-grade security on every transaction" },
  { label: "Webhook Verified", desc: "HMAC-signed payment confirmations" },
  { label: "Idempotent Ledger", desc: "No double-charges, ever" },
]

// Featured homepage categories. Keep this curated list aligned with the
// blog navigation. Job and scholarship links are also shown in the dedicated
// opportunities section below, even before posts have been published.
const HOMEPAGE_BLOG_CATEGORIES = [
  { slug: "tech-news", label: "Tech News" },
  { slug: "guides", label: "Guides" },
  { slug: "network-news", label: "Network News" },
  { slug: "promotions", label: "Promotions" },
  { slug: "announcements", label: "Announcements" },
  { slug: "jobs", label: "Jobs" },
  { slug: "scholarships", label: "Scholarships" },
  { slug: "grants", label: "Grants" },
  { slug: "internships", label: "Internships" },
]

const HOMEPAGE_POSTS_PER_CATEGORY = 10

// Jobs, Scholarships, Grants and Internships are capped lower than the
// other homepage categories. These feed fast-expiring listings
// (retention.ts deletes stale posts in jobs/scholarships), so the
// homepage only needs a handful, not the full 10 shown for evergreen
// categories like Guides.
const HOMEPAGE_JOBS_SCHOLARSHIPS_POST_LIMIT = 6
const HOMEPAGE_CAPPED_CATEGORY_SLUGS = new Set(["jobs", "scholarships", "grants", "internships"])

export const revalidate = 900 // 15 minutes. Homepage content does not need to be second-fresh.

export default async function HomePage() {
  const [postsByCategory, cappedPostsByCategory] = await Promise.all([
    listLatestPostsByCategories(
      HOMEPAGE_BLOG_CATEGORIES.filter((c) => !HOMEPAGE_CAPPED_CATEGORY_SLUGS.has(c.slug)).map((c) => c.slug),
      HOMEPAGE_POSTS_PER_CATEGORY,
    ),
    listLatestPostsByCategories(
      HOMEPAGE_BLOG_CATEGORIES.filter((c) => HOMEPAGE_CAPPED_CATEGORY_SLUGS.has(c.slug)).map((c) => c.slug),
      HOMEPAGE_JOBS_SCHOLARSHIPS_POST_LIMIT,
    ),
  ])
  Object.assign(postsByCategory, cappedPostsByCategory)

  const categorySections = HOMEPAGE_BLOG_CATEGORIES.filter((c) => postsByCategory[c.slug]?.length)

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="zpx-dot-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="container relative py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="zpx-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Digital services and useful information
            </span>
            <h1 className="mt-5 text-4xl font-heading font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Airtime, data, and bills, all from one fast, reliable wallet
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Built for reliability. Transactions go through fast, every time, with instant delivery on airtime,
              data, and bills. No more failed purchases wasting your money.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="w-full rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary sm:w-auto"
              >
                Create free account
              </Link>
              <Link
                href="/login"
                className="w-full rounded-lg border border-white/20 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:w-auto"
              >
                Log in
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-white/55">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Fast delivery</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure wallet</span>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Multiple providers</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-white">
        <div className="container grid grid-cols-2 divide-x divide-border py-5 sm:grid-cols-4">
          {[
            ["10+", "Services"],
            ["24/7", "Self-service access"],
            ["1 wallet", "For your payments"],
            ["Secure", "Payment flow"],
          ].map(([value, label]) => (
            <div key={label} className="px-3 text-center first:pl-0 last:pr-0 sm:px-5">
              <p className="text-lg font-heading font-bold text-secondary sm:text-xl">{value}</p>
              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services grid */}
      <section className="zpx-section container">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="zpx-eyebrow">Pay in seconds</span>
            <h2 className="mt-2 text-2xl font-heading font-bold tracking-tight text-secondary sm:text-3xl">Everything in one place</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">All your services, one wallet, one login.</p>
          </div>
          <span className="hidden text-xs font-medium text-muted-foreground sm:block">Choose a service to get started</span>
        </div>
        <ServiceQuickSearch services={SERVICES.map(({ href, label, desc }) => ({ href, label, desc }))} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SERVICES.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group relative overflow-hidden rounded-xl border border-border bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift sm:p-5"
              >
                <span className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${s.iconClass}`}>
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

      {/* How it works */}
      <section className="border-t border-border bg-muted/30 py-14 sm:py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <span className="zpx-eyebrow">Getting started</span>
            <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">How ZamoraxPay works</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">Four simple steps from sign up to delivery.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, idx) => (
              <div key={step.n} className="relative rounded-xl border border-border bg-white p-5 shadow-soft">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  {step.n}
                </div>
                <h3 className="font-heading font-semibold text-secondary">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                {idx < STEPS.length - 1 && (
                  <span aria-hidden className="pointer-events-none absolute -right-2 top-7 hidden h-px w-4 bg-border lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why ZamoraxPay */}
      <section className="zpx-section">
        <div className="container">
          <div className="mb-8 text-center">
            <span className="zpx-eyebrow">Why ZamoraxPay</span>
            <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">Why people trust ZamoraxPay</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              We built ZamoraxPay after seeing too many failed top-ups and slow refunds. Here is how we try to do better.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t, i) => (
              <div key={t.title} className="group rounded-xl border border-border bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-primary">
                  {i === 0 ? <Zap className="h-5 w-5" /> : i === 1 ? <ShieldCheck className="h-5 w-5" /> : i === 2 ? <CheckCircle2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </div>
                <h3 className="font-heading font-semibold text-secondary">{t.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner networks (logos as text chips, no image dependency) */}
      <section className="border-t border-border bg-muted/30 py-12">
        <div className="container">
          <div className="mb-6 text-center">
            <span className="zpx-eyebrow">Supported networks and billers</span>
            <h2 className="mt-2 text-xl font-heading font-bold text-secondary sm:text-2xl">Every network and biller you actually use</h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PARTNERS.map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-secondary shadow-soft"
                title={`${p.label} - ${p.desc}`}
              >
                <span className="font-heading font-bold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.desc}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Security and compliance badges */}
      <section className="border-t border-border py-12">
        <div className="container">
          <div className="mb-6 text-center">
            <span className="zpx-eyebrow">Security and compliance</span>
            <h2 className="mt-2 text-xl font-heading font-bold text-secondary sm:text-2xl">Protected by these guarantees</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your money and data are protected by these guarantees.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY_BADGES.map((b) => (
              <div key={b.label} className="flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-soft">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-secondary">{b.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-border bg-muted/30 py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <span className="zpx-eyebrow">What Nigerians say</span>
            <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">Real users, real transactions</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="flex h-full flex-col rounded-xl border border-border bg-white p-5 shadow-soft">
                <div className="mb-3 flex gap-0.5 text-amber-400" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.964a1 1 0 00.95.69h4.166c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.964c.3.922-.755 1.688-1.54 1.118L10 14.347l-3.371 2.448c-.784.57-1.838-.196-1.539-1.118l1.287-3.964a1 1 0 00-.364-1.118L2.643 9.39c-.783-.57-.38-1.81.588-1.81h4.166a1 1 0 00.95-.69l1.286-3.964z" /></svg>
                  ))}
                </div>
                <blockquote className="flex-1 text-sm leading-6 text-secondary">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 border-t border-border pt-3">
                  <p className="text-sm font-semibold text-secondary">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}, {t.location}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Rewards */}
      <section className="border-t border-border py-16">
        <div className="container">
          <div className="mb-8 text-center">
            <span className="zpx-eyebrow">Earn as you spend</span>
            <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">Get rewarded for every purchase</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Cashback, referral bonuses, daily streaks, and prizes, all credited to your ZamoraxPay wallet.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {REWARDS.map((r) => (
              <div key={r.label} className="rounded-xl border border-border bg-white p-5 shadow-soft">
                <div className="mb-2 text-2xl" aria-hidden="true">{r.icon}</div>
                <h3 className="font-heading font-semibold text-secondary">{r.label}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              Create free account to start earning
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Jobs and scholarships: visible even before the first post */}
      <section className="border-t border-border bg-muted/30 py-14 sm:py-16">
        <div className="container">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="zpx-eyebrow">New opportunities</span>
              <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">Jobs, scholarships, grants and internships</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Explore career openings and education funding opportunities. Always confirm details and deadlines with the official provider.
              </p>
            </div>
            <Link href="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Explore the blog <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { slug: "jobs", label: "Jobs and Career Opportunities", description: "Explore vacancies, graduate trainee programmes, and entry-level roles.", icon: Users, tone: "bg-blue-50 text-blue-700" },
              { slug: "scholarships", label: "Scholarships and Bursaries", description: "Find education funding opportunities and practical guides to preparing applications.", icon: GraduationCap, tone: "bg-emerald-50 text-emerald-700" },
              { slug: "grants", label: "Grants", description: "Grant opportunities and funding calls, with eligibility and application guidance.", icon: Award, tone: "bg-amber-50 text-amber-700" },
              { slug: "internships", label: "Internships", description: "Internship openings and placement programmes to build real work experience.", icon: Briefcase, tone: "bg-fuchsia-50 text-fuchsia-700" },
            ].map((item) => {
              const Icon = item.icon
              const posts = (postsByCategory[item.slug] ?? []).slice(0, 3)
              return (
                <article key={item.slug} className="flex h-full flex-col rounded-xl border border-border bg-white p-5 shadow-soft transition hover:border-primary/30 hover:shadow-card sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${item.tone}`}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-lg font-bold text-secondary">{item.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  {posts.length > 0 ? (
                    <ul className="mt-4 space-y-3 border-t border-border pt-4">
                      {posts.map((post) => (
                        <li key={post.id}>
                          <Link href={`/blog/${post.slug}`} className="text-sm font-medium text-secondary hover:text-primary hover:underline">{post.title}</Link>
                          {post.publishedAt && <p className="mt-1 text-xs text-muted-foreground">{formatDate(post.publishedAt)}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground">New opportunities will appear here as articles are published.</p>
                  )}
                  <Link href={`/blog?category=${item.slug}`} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                    Browse {item.slug} <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* From the blog: magazine-style rows by category */}
      {categorySections.length > 0 && (
        <section className="border-t border-border py-16">
          <div className="container">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <span className="zpx-eyebrow">From the blog</span>
                <h2 className="mt-2 text-2xl font-heading font-bold text-secondary sm:text-3xl">Guides, updates, and tips</h2>
              </div>
              <Link href="/blog" className="hidden text-sm font-semibold text-primary hover:underline sm:block">
                View all posts →
              </Link>
            </div>

            <div className="space-y-14">
              {categorySections.map((cat) => {
                const posts = postsByCategory[cat.slug] ?? []
                return (
                  <div key={cat.slug}>
                    <div className="mb-5 flex items-end justify-between border-b border-border pb-2">
                      <h3 className="text-xl font-heading font-bold text-secondary">{cat.label}</h3>
                      <Link
                        href={`/blog?category=${cat.slug}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        See more →
                      </Link>
                    </div>

                    {posts.length > 0 && (
                      <div className="space-y-6">
                        {/* Featured post */}
                        <Link href={`/blog/${posts[0].slug}`} className="group block">
                          <div className="mb-4 aspect-[1200/630] overflow-hidden rounded-xl border border-border bg-secondary">
                            <img
                              src={posts[0].coverImageUrl || "/blog-fallback-cover.svg"}
                              alt={posts[0].title}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          <h4 className="mb-1 text-lg font-heading font-semibold text-secondary group-hover:text-primary sm:text-xl">
                            {posts[0].title}
                          </h4>
                          {posts[0].excerpt && (
                            <p className="mb-2 text-sm leading-6 text-muted-foreground line-clamp-2">{posts[0].excerpt}</p>
                          )}
                          {posts[0].publishedAt && (
                            <p className="text-xs text-muted-foreground">{formatDate(posts[0].publishedAt)}</p>
                          )}
                        </Link>

                        {/* Remaining posts as a list */}
                        {posts.length > 1 && (
                          <div className="divide-y divide-border rounded-xl border border-border bg-white shadow-soft">
                            {posts.slice(1).map((post) => (
                              <Link
                                key={post.id}
                                href={`/blog/${post.slug}`}
                                className="group flex items-center gap-4 p-4 transition hover:bg-muted/40"
                              >
                                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-secondary sm:h-20 sm:w-28">
                                  <img
                                    src={post.coverImageUrl || "/blog-fallback-cover.svg"}
                                    alt={post.title}
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
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
              <Link href="/blog" className="text-sm font-semibold text-primary hover:underline">
                View all posts →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="border-t border-border bg-secondary py-16 text-white sm:py-20">
        <div className="container text-center">
          <span className="zpx-eyebrow text-primary">Get started today</span>
          <h2 className="mt-2 text-2xl font-heading font-bold sm:text-3xl">Ready to get started?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70 sm:text-base">
            Sign up in under a minute and fund your wallet to make your first purchase.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110">Create free account <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/blog" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Explore our guides</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
