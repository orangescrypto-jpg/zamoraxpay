// app/(public)/services/[slug]/page.tsx
// Public, unauthenticated marketing page for one service (Airtime, Data,
// Cable, Electricity, Exam PINs, Airtime to Cash, ePIN, Bulk Airtime,
// Bulk Data, International Top-up). Separate from the gated buy form at
// /dashboard/services/[slug]. Content is fully admin-editable — see
// app/(admin)/admin/service-pages/page.tsx.

import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { d1Query } from "@/lib/db"
import { isFeatureEnabled } from "@/src/services/config"
import { MarkdownContent } from "@/components/shared/MarkdownContent"

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await getServicePage(slug)
  return {
    title: `${page?.title ?? "Service"} — ZamoraxPay`,
    description: page?.meta_description ?? undefined,
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

  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-secondary sm:text-4xl">{page.title}</h1>
        {page.tagline && <p className="mt-2 text-lg text-muted-foreground">{page.tagline}</p>}
      </div>

      {networks.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {networks.map((n) => (
            <span
              key={n}
              className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-secondary"
            >
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="mb-8">
        <Link
          href={page.buy_button_href}
          className="inline-block rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {page.buy_button_label ?? "Buy Now"}
        </Link>
      </div>

      <MarkdownContent markdown={page.content_markdown} />

      {pricing.length > 0 && (
        <div className="mt-10">
          <h2 className="font-heading text-xl font-semibold text-secondary">Pricing & Fees</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {pricing.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 1 ? "bg-muted/50" : ""}>
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
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {faqs.map((f) => (
              <div key={f.question} className="p-4">
                <p className="font-medium text-secondary">{f.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 border-t border-border pt-6 text-center">
        <Link
          href={page.buy_button_href}
          className="inline-block rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {page.buy_button_label ?? "Buy Now"}
        </Link>
      </div>
    </div>
  )
}
