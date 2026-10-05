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

// Scans the raw markdown for ## / ### lines and returns them with the
// same ids renderMarkdown() will assign, so a table of contents built
// from this always matches the in-page anchors. Returns [] for
// raw-HTML posts, which have no markdown headings to extract.
export function extractHeadings(markdown: string): TocHeading[] {
  if (isRawHtml(markdown)) return []

  const seen = new Map<string, number>()
  const headings: TocHeading[] = []

  for (const line of markdown.split("\n")) {
    const match = /^(#{2,3}) (.+)$/.exec(line)
    if (!match) continue
    const level = match[1].length === 3 ? 3 : 2
    const text = match[2].trim()
    headings.push({ id: slugifyHeading(text, seen), text, level })
  }

  return headings
}

export function renderMarkdown(markdown: string): string {
  if (isRawHtml(markdown)) {
    return stripHtmlMarker(markdown)
  }

  let html = markdown
  const headingIds = new Map<string, number>()

  // Headings. ## and ### get slug ids so a table of contents can link
  // straight to them. Both lines are matched in a single top-to-bottom
  // pass (not two separate ### then ## passes) so ids are assigned in
  // document order — the same order extractHeadings() walks in, which
  // is what keeps the two in agreement.
  html = html.replace(/^(#{2,3}) (.+)$/gm, (_m, hashes: string, text: string) => {
    const level = hashes.length === 3 ? 3 : 2
    const id = slugifyHeading(text, headingIds)
    return `<h${level} id="${id}">${text}</h${level}>`
  })
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
