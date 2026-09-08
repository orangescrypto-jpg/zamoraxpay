// app/(public)/about/page.tsx
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { d1Query } from "@/lib/db"
import { MarkdownContent } from "@/components/shared/MarkdownContent"

async function getPage() {
  const result = await d1Query("SELECT * FROM site_pages WHERE slug = ?", ["about"])
  return result.results?.[0] ?? null
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage()
  return { title: `${page?.title ?? "About ZamoraxPay"} — ZamoraxPay`, description: page?.meta_description }
}

export const revalidate = 3600

export default async function AboutPage() {
  const page = await getPage()
  if (!page) notFound()

  return (
    <div className="container max-w-3xl py-12">
      <MarkdownContent markdown={page.content_markdown} />
    </div>
  )
}
