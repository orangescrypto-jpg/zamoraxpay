// app/(public)/services/[slug]/page.tsx
// Public, unauthenticated marketing page for one service (Airtime, Data,
// Cable, Electricity, Exam PINs, Airtime to Cash, ePIN, Bulk Airtime,
// Bulk Data, International Top-up). Separate from the gated buy form at
// /dashboard/services/[slug]. Content is fully admin-editable. See
// app/(admin)/admin/service-pages/page.tsx.

import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { d1Query } from "@/lib/db"
import { isFeatureEnabled } from "@/src/services/config"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { Breadcrumbs } from "@/components/shared/Breadcrumbs"

function safeJsonArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function getServicePage(slug: string) {
  const result = await d1Query("SELECT * FROM service_pages WHERE slug = ?", [slug])
  return result.results?.[0] ?? null
}

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await getServicePage(slug)
  const title = page?.title ?? "Service"
  const description = page?.meta_description ?? `Buy ${title.toLowerCase()} on ZamoraxPay. Fast delivery, secure wallet, multiple providers, automatic refunds.`
  const url = `${BASE}/services/${slug}`
  return {
    title: `${title} - ZamoraxPay`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${title} - ZamoraxPay`,
      description,
      siteName: "ZamoraxPay",
      locale: "en_NG",
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "ZamoraxPay" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - ZamoraxPay`,
      description,
      images: ["/icon-512.png"],
    },
    keywords: [title, "Nigeria", "ZamoraxPay", "instant", "wallet", "buy"],
  }
}

export const revalidate = 60

export default async function ServiceMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const enabled = await isFeatureEnabled("public_service_pages")
  const page = await getServicePage(slug)
  if (!page) notFound()

  // Feature flag off: skip the marketing page and send visitors straight
  // to the gated buy form (which itself redirects to /login if needed).
  if (!enabled) redirect(page.buy_button_href)

  const networks: string[] = safeJsonArray(page.networks_json)
  const pricing: { label: string; value: string }[] = safeJsonArray(page.pricing_json)
  const faqs: { question: string; answer: string }[] = safeJsonArray(page.faqs_json)

  // Schema.org Service + FAQPage JSON-LD. Both unlock rich Google results:
  //  - Service: shows the brand + offer snippet in search results.
  //  - FAQPage: shows collapsible FAQ answers directly in Google search.
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.title,
    description: page.meta_description ?? page.tagline ?? undefined,
    url: `${BASE}/services/${slug}`,
    serviceType: page.title,
    provider: {
      "@type": "Organization",
      name: "ZamoraxPay",
      url: BASE,
      logo: `${BASE}/icon-512.png`,
    },
    areaServed: { "@type": "Country", name: "Nigeria" },
    audience: { "@type": "Audience", audienceType: "Nigerian consumers and resellers" },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "NGN",
      url: `${BASE}/services/${slug}`,
      seller: { "@type": "Organization", name: "ZamoraxPay" },
    },
    brand: { "@type": "Brand", name: "ZamoraxPay" },
  }

  const faqJsonLd = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  } : null

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/blog" },
    { label: page.title },
  ]

  return (
    <div className="bg-background">
      {serviceJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      )}
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <Breadcrumbs items={breadcrumbItems} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="container relative py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <span className="zpx-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Digital service
            </span>
            <h1 className="mt-4 text-3xl font-heading font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">{page.title}</h1>
            {page.tagline && <p className="mt-3 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">{page.tagline}</p>}
            <div className="mt-6">
              <Link
                href={page.buy_button_href}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
              >
                {page.buy_button_label ?? "Buy Now"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {networks.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {networks.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur"
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container max-w-3xl py-10 sm:py-14">
        <div className="zpx-card p-6 sm:p-8">
          <MarkdownContent markdown={page.content_markdown} />
        </div>

        {pricing.length > 0 && (
          <div className="mt-10">
            <h2 className="font-heading text-xl font-semibold text-secondary">Pricing and Fees</h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white shadow-soft">
              <table className="w-full text-sm">
                <tbody>
                  {pricing.map((row, i) => (
                    <tr key={row.label} className={i % 2 === 1 ? "bg-muted/40" : ""}>
                      <td className="px-4 py-3 font-medium text-secondary">{row.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {faqs.length > 0 && (
          <div className="mt-10">
            <h2 className="font-heading text-xl font-semibold text-secondary">Frequently Asked Questions</h2>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-soft">
              {faqs.map((f) => (
                <div key={f.question} className="p-4">
                  <p className="font-medium text-secondary">{f.question}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-border bg-secondary p-8 text-center shadow-soft">
          <h2 className="font-heading text-xl font-bold text-white">Ready to buy?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            Open the secure purchase flow and complete your transaction in under a minute.
          </p>
          <Link
            href={page.buy_button_href}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            {page.buy_button_label ?? "Buy Now"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
