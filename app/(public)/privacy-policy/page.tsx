// app/(public)/privacy-policy/page.tsx
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { d1Query } from "@/lib/db"
import { MarkdownContent } from "@/components/shared/MarkdownContent"

async function getPage(slug: string) {
  const result = await d1Query("SELECT * FROM site_pages WHERE slug = ?", [slug])
  return result.results?.[0] ?? null
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("privacy-policy")
  return { title: `${page?.title ?? "Privacy Policy"} — ZamoraxPay`, description: page?.meta_description }
}

export const revalidate = 60

export default async function PrivacyPolicyPage() {
  const page = await getPage("privacy-policy")
  if (!page) notFound()

  return (
    <div className="container max-w-3xl py-12">
      <MarkdownContent markdown={page.content_markdown} />
    </div>
  )
}
