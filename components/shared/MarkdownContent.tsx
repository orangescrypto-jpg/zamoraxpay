// components/shared/MarkdownContent.tsx
import { renderMarkdown } from "@/lib/simpleMarkdown"

export function MarkdownContent({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div
      className={`prose prose-slate max-w-none
        prose-headings:font-heading prose-headings:text-secondary
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-strong:text-secondary
        prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
        prose-img:rounded-lg
        ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  )
}
