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

export function renderMarkdown(markdown: string): string {
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
  html = html.replace(/!\[(.*?)\]\((.+?)\)/g, '<img src="$2" alt="$1" />')

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
