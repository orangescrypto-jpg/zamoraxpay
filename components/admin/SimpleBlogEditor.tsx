// components/admin/SimpleBlogEditor.tsx
// A textarea for content plus a live preview pane. Supports two modes:
// Markdown (converted via lib/simpleMarkdown.ts, as before) and raw
// HTML (passed straight through, unconverted). The mode is stored as
// a prefix marker inside the content string itself — see
// lib/simpleMarkdown.ts's isRawHtml()/stripHtmlMarker() — so no schema
// change was needed to add HTML support.
//
// Inline images: the "Insert image" button uploads a new image (or
// reuses a previous blog upload) and inserts it at the cursor as
// ![alt](url) in Markdown mode, or <img ... /> in HTML mode.

"use client"

import { useRef, useState } from "react"
import { MarkdownContent } from "@/components/shared/MarkdownContent"
import { isRawHtml, addHtmlMarker, stripHtmlMarker } from "@/lib/simpleMarkdown"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"

interface SimpleBlogEditorProps {
  value: string
  onChange: (markdown: string) => void
  minHeight?: number
}

interface UploadedFile {
  key: string
  url: string
  uploadedAt: string | null
  size: number
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

export function SimpleBlogEditor({ value, onChange, minHeight = 400 }: SimpleBlogEditorProps) {
  const [view, setView] = useState<"write" | "preview">("write")
  const [mode, setMode] = useState<"markdown" | "html">(isRawHtml(value) ? "html" : "markdown")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previous, setPrevious] = useState<UploadedFile[]>([])
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [altText, setAltText] = useState("")

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

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  function insertImage(url: string) {
    const alt = altText.trim()
    const snippet =
      mode === "html"
        ? `\n<img src="${url}" alt="${escapeAttr(alt)}" />\n`
        : `\n![${alt.replace(/[\[\]]/g, "")}](${url})\n`

    const el = textareaRef.current
    const start = el?.selectionStart ?? rawContent.length
    const end = el?.selectionEnd ?? rawContent.length
    const next = rawContent.slice(0, start) + snippet + rawContent.slice(end)
    handleContentChange(next)
    setAltText("")
    setView("write")

    // Restore focus and place the cursor right after the inserted image.
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (!t) return
      const pos = start + snippet.length
      t.focus()
      t.setSelectionRange(pos, pos)
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const input = e.target
    if (!file) return

    setUploading(true)
    try {
      const headers = await getAuthHeader()
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "blog")

      const res = await fetch("/api/admin/upload", { method: "POST", headers, body: formData })
      const data = await res.json()
      if (res.ok) {
        insertImage(data.url)
        setPickerOpen(false)
      } else {
        alert(data.error ?? "Upload failed")
      }
    } catch {
      alert("Upload failed")
    } finally {
      setUploading(false)
      input.value = ""
    }
  }

  async function openPicker() {
    setPickerOpen(true)
    setLoadingPrevious(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/admin/uploads?folder=blog", { headers })
      const data = await res.json()
      setPrevious(data.files ?? [])
    } catch {
      setPrevious([])
    } finally {
      setLoadingPrevious(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
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
          <button
            type="button"
            onClick={openPicker}
            className="ml-1 rounded border border-border px-3 py-1 text-xs font-medium text-secondary hover:bg-muted"
          >
            + Insert image
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
          ref={textareaRef}
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

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-secondary">Insert image</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-sm text-muted-foreground hover:text-secondary"
              >
                Close
              </button>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-secondary">
                Alt text (describe the image, good for SEO and accessibility)
              </label>
              <input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
                placeholder="MTN data balance USSD code on a phone screen"
              />
            </div>

            <label className="mb-4 inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary hover:bg-muted">
              {uploading ? "Uploading..." : "Upload new image"}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Or pick a previous upload
            </h4>
            {loadingPrevious ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : previous.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous uploads yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                {previous.map((file) => (
                  <button
                    key={file.key}
                    type="button"
                    onClick={() => {
                      insertImage(file.url)
                      setPickerOpen(false)
                    }}
                    className="aspect-square overflow-hidden rounded-lg border-2 border-transparent transition hover:border-primary"
                  >
                    <img src={file.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
