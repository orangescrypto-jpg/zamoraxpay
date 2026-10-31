// lib/readingTime.ts
// Word-count based reading time estimator. Used on blog cards and
// article pages to give readers a quick expectation. Strips markdown
// noise (code, links, images) before counting words so the estimate
// matches what a reader actually consumes.

export function estimateReadingTime(markdown: string | null | undefined, wpm = 220): number {
  if (!markdown) return 0
  const text = markdown
    // code blocks
    .replace(/```[\s\S]*?```/g, " ")
    // inline code
    .replace(/`[^`]+`/g, " ")
    // images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // links - keep label, drop URL
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // headings
    .replace(/^#{1,6}\s+/gm, " ")
    // bold/italic markers
    .replace(/[*_~]+/g, "")
    // HTML tags
    .replace(/<[^>]+>/g, " ")
    .trim()

  if (!text) return 0
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / wpm))
}

export function wordCount(markdown: string | null | undefined): number {
  if (!markdown) return 0
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .trim()
  return text ? text.split(/\s+/).filter(Boolean).length : 0
}

export function formatReadingTime(minutes: number): string {
  if (!minutes || minutes < 1) return "1 min read"
  return `${minutes} min read`
}
