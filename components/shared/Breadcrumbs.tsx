// components/shared/Breadcrumbs.tsx
// Visual breadcrumbs + matching BreadcrumbList JSON-LD schema.
// Used on every public inner page so Google can render breadcrumb rich
// results in search, and users always have a way back up the hierarchy.

import Link from "next/link"

export type Crumb = {
  label: string
  href?: string
}

function buildJsonLd(crumbs: Crumb[], baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: c.href ? `${baseUrl}${c.href}` : undefined,
    })),
  }
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zamoraxpay.com.ng"
  const jsonLd = buildJsonLd(items, baseUrl)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="container py-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1
            return (
              <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="rounded-sm font-medium text-secondary transition hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-muted-foreground" : "font-medium text-secondary"} aria-current={isLast ? "page" : undefined}>
                    {item.label}
                  </span>
                )}
                {!isLast && (
                  <span aria-hidden className="text-muted-foreground/50">/</span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
