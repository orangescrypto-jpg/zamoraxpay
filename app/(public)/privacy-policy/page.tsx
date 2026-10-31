// app/(public)/privacy-policy/page.tsx
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { d1Query } from "@/lib/db"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { Breadcrumbs } from "@/components/shared/Breadcrumbs"

async function getPage(slug: string) {
  const result = await d1Query("SELECT * FROM site_pages WHERE slug = ?", [slug])
  return result.results?.[0] ?? null
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("privacy-policy")
  return { title: `${page?.title ?? "Privacy Policy"} - ZamoraxPay`, description: page?.meta_description }
}

export const revalidate = 60

export default async function PrivacyPolicyPage() {
  const page = await getPage("privacy-policy")
  if (!page) notFound()

  return (
    <div className="bg-background">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Privacy Policy", href: "/privacy-policy" },
        ]}
      />
      <section className="relative overflow-hidden border-b border-border bg-secondary">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
        <div className="container relative py-12 sm:py-16">
          <div className="max-w-3xl">
            <span className="zpx-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Legal
            </span>
            <h1 className="mt-4 text-3xl font-heading font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">{page?.title ?? "Privacy Policy"}</h1>
          </div>
        </div>
      </section>
      <div className="container max-w-3xl py-10 sm:py-14">
        <div className="zpx-card p-6 sm:p-8">
          <MarkdownContent markdown={page.content_markdown} />
        </div>
      </div>
    </div>
  )
}
