// components/admin/SimpleBlogEditor.tsx
// A textarea for content plus a live preview pane. Supports two modes:
// Markdown (converted via lib/simpleMarkdown.ts, as before) and raw
// HTML (passed straight through, unconverted). The mode is stored as
// a prefix marker inside the content string itself — see
// lib/simpleMarkdown.ts's isRawHtml()/stripHtmlMarker() — so no schema
// change was needed to add HTML support.

"use client"

import { useState } from "react"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { isRawHtml, addHtmlMarker, stripHtmlMarker } from "@/lib/simpleMarkdown"
import { cn } from "@/lib/utils"

interface SimpleBlogEditorProps {
  value: string
  onChange: (markdown: string) => void
  minHeight?: number
}

export function SimpleBlogEditor({ value, onChange, minHeight = 400 }: SimpleBlogEditorProps) {
  const [view, setView] = useState<"write" | "preview">("write")
  const [mode, setMode] = useState<"markdown" | "html">(isRawHtml(value) ? "html" : "markdown")

  const rawContent = stripHtmlMarker(value)
  const wordCount = rawContent.trim().split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  function handleContentChange(next: string) {
    onChange(mode === "html" ? addHtmlMarker(next) : next)
  }

  function handleModeChange(next: "markdown" | "html") {
    setMode(next)
    // Re-tag the existing content with (or without) the HTML marker so
    // switching modes doesn't silently misinterpret what's already typed.
    onChange(next === "html" ? addHtmlMarker(rawContent) : rawContent)
  }

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setView("write")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium",
              view === "write" ? "bg-primary text-primary-foreground" : "text-secondary hover:bg-muted",
            )}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setView("preview")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium",
              view === "preview" ? "bg-primary text-primary-foreground" : "text-secondary hover:bg-muted",
            )}
          >
            Preview
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange("markdown")}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                mode === "markdown" ? "bg-secondary text-white" : "text-secondary hover:bg-muted",
              )}
            >
              Markdown
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("html")}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium",
                mode === "html" ? "bg-secondary text-white" : "text-secondary hover:bg-muted",
              )}
            >
              HTML
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            ~{wordCount} words · {readingTime} min read
          </span>
        </div>
      </div>

      {view === "write" ? (
        <textarea
          value={rawContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={
            mode === "html"
              ? `<h1>Heading</h1>\n\n<p>Write your article here using raw HTML.</p>\n\n<h2>Sub-heading</h2>\n\n<ul>\n  <li>Point one</li>\n  <li>Point two</li>\n</ul>\n\n<a href="https://example.com">A link</a>`
              : `# Heading\n\nWrite your article here using Markdown.\n\n## Sub-heading\n\n- Point one\n- Point two\n\n[A link](https://example.com)`
          }
          style={{ minHeight, overflowWrap: "break-word", whiteSpace: "pre-wrap" }}
          className="w-full resize-y break-words p-4 font-mono text-sm text-secondary outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <div style={{ minHeight }} className="p-4">
          {rawContent.trim() ? (
            <MarkdownContent markdown={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="border-t border-border px-3 py-2">
        {mode === "html" ? (
          <p className="text-xs text-muted-foreground">
            Raw HTML mode: content is rendered exactly as written, unconverted.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Markdown supported: # headings, **bold**, *italic*, - lists, [links](url), ![images](url), &gt; blockquotes, --- dividers.
          </p>
        )}
      </div>
    </div>
  )
}
