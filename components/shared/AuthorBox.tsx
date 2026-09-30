// components/shared/AuthorBox.tsx
import Link from "next/link"

interface Props {
  authorName: string | null
  authorSlug?: string | null
  authorPhotoUrl?: string | null
}

/**
 * Byline card shown under a blog post. Links to the author's public
 * profile page only when the post is linked to a structured author
 * (authorSlug set) — a plain free-text byline like "The ZamoraxPay Team"
 * just renders as text with no link.
 */
export function AuthorBox({ authorName, authorSlug, authorPhotoUrl }: Props) {
  if (!authorName) return null

  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-border p-4">
      {authorPhotoUrl ? (
        <img src={authorPhotoUrl} alt={authorName} className="h-12 w-12 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-base font-semibold text-secondary-foreground">
          {authorName.charAt(0)}
        </div>
      )}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Written by</p>
        <p className="font-heading font-medium text-secondary">{authorName}</p>
        {authorSlug && <p className="text-xs text-primary">View profile →</p>}
      </div>
    </div>
  )

  if (!authorSlug) return content

  return (
    <Link href={`/blog/authors/${authorSlug}`} className="block transition-opacity hover:opacity-80">
      {content}
    </Link>
  )
}
