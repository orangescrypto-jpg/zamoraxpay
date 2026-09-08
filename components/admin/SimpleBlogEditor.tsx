// components/admin/SimpleBlogEditor.tsx
// Deliberately plain: a single textarea for Markdown content plus a
// live preview pane — no rich-text/WYSIWYG editor, no contentEditable,
// no toolbar buttons. Admin writes Markdown directly; it's rendered to
// HTML on save (and on the public blog page) via lib/simpleMarkdown.ts.

"use client"

import { useState } from "react"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { cn } from "@/lib/utils"

interface SimpleBlogEditorProps {
  value: string
  onChange: (markdown: string) => void
  minHeight?: number
}

export function SimpleBlogEditor({ value, onChange, minHeight = 400 }: SimpleBlogEditorProps) {
  const [view, setView] = useState<"write" | "preview">("write")

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
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
        <span className="text-xs text-muted-foreground">
          ~{wordCount} words · {readingTime} min read
        </span>
      </div>

      {view === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`# Heading\n\nWrite your article here using Markdown.\n\n## Sub-heading\n\n- Point one\n- Point two\n\n[A link](https://example.com)`}
          style={{ minHeight }}
          className="w-full resize-y p-4 font-mono text-sm text-secondary outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <div style={{ minHeight }} className="p-4">
          {value.trim() ? (
            <MarkdownContent markdown={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Markdown supported: # headings, **bold**, *italic*, - lists, [links](url), ![images](url), &gt; blockquotes, --- dividers.
        </p>
      </div>
    </div>
  )
}
