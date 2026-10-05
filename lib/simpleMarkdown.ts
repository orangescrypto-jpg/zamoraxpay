// lib/simpleMarkdown.ts
// Lightweight markdown → HTML conversion, no external library.
// Deliberately simple (not a full CommonMark implementation) — this
// covers headings, bold/italic, lists, links, images, blockquotes,
// and paragraphs, which is what the blog and legal pages need.
// Admin content is trusted (authored by admins only, not end users),
// so no sanitization pass is applied here.
//
// Raw HTML mode: rather than adding a schema column, content authored
// as raw HTML is prefixed with a hidden marker comment when saved.
// renderMarkdown() detects the marker and returns the content
// untouched (skipping every regex pass below) instead of running it
// through markdown conversion. The editor's mode toggle reads/writes
// this same marker via isRawHtml()/addHtmlMarker()/stripHtmlMarker().

const HTML_MARKER = "<!--zamoraxpay:raw-html-->"

export function isRawHtml(content: string): boolean {
  return content.startsWith(HTML_MARKER)
}

export function addHtmlMarker(content: string): string {
  return isRawHtml(content) ? content : `${HTML_MARKER}\n${content}`
}

export function stripHtmlMarker(content: string): string {
  return isRawHtml(content) ? content.slice(HTML_MARKER.length).replace(/^\n/, "") : content
}

// Turns a heading's text into a URL-safe, de-duplicated #anchor id.
// Exported so the table-of-contents extractor below can produce the
// exact same ids the rendered HTML will carry.
export function slugifyHeading(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, "") // strip any inline tags (e.g. <strong>) first
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "section"

  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

export type TocHeading = { id: string; text: string; level: 2 | 3 }

// Strips tags/entities from a heading's inner HTML down to plain text,
// for both the TOC label and the slug source.
function headingPlainText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

// Walks the FINAL rendered HTML (markdown-converted or raw-HTML, either
// way) and assigns ids to any <h2>/<h3> tags that don't already have
// one — then returns that same list for the table of contents. Doing
// this as one pass over the rendered output, rather than over the raw
// markdown source, means the TOC works for raw-HTML posts too (where
// there's no markdown "##" syntax to scan for) and the ids it returns
// are always exactly the ids actually sitting in the page's HTML.
export function injectHeadingIds(html: string): { html: string; headings: TocHeading[] } {
  const seen = new Map<string, number>()
  const headings: TocHeading[] = []

  const withIds = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h[23]>/g,
    (full, levelStr: string, attrs: string, inner: string) => {
      const level = Number(levelStr) as 2 | 3
      const text = headingPlainText(inner)
      if (!text) return full // skip empty headings rather than listing a blank TOC entry

      const existingId = /\bid=["']([^"']+)["']/.exec(attrs)?.[1]
      const id = existingId || slugifyHeading(text, seen)
      headings.push({ id, text, level })

      if (existingId) return full
      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`
    }
  )

  return { html: withIds, headings }
}

// Convenience wrapper for callers that only need the heading list (the
// blog post page uses this to build the TOC without re-deriving HTML).
export function extractHeadings(markdown: string): TocHeading[] {
  return injectHeadingIds(renderMarkdownRaw(markdown)).headings
}

export function renderMarkdown(markdown: string): string {
  return injectHeadingIds(renderMarkdownRaw(markdown)).html
}

// The original conversion pass (markdown → HTML, or pass-through for
// raw-HTML posts) with no heading ids added yet — injectHeadingIds()
// adds those afterward in one shared pass so both renderMarkdown() and
// extractHeadings() stay in agreement by construction, not by convention.
function renderMarkdownRaw(markdown: string): string {
  if (isRawHtml(markdown)) {
    return stripHtmlMarker(markdown)
  }

  let html = markdown

  // Headings (order matters — ### before ## before #)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")

  // Images (before links, since the syntax overlaps)
  html = html.replace(/!\[(.*?)\]\((.+?)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async" />')

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr />")

  // Paragraphs — wrap remaining bare lines that aren't already tags
  const lines = html.split("\n")
  const wrapped = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return ""
    if (/^<(h1|h2|h3|ul|ol|li|blockquote|hr|img|p)/.test(trimmed)) return trimmed
    return `<p>${trimmed}</p>`
  })

  return wrapped.filter(Boolean).join("\n")
}
