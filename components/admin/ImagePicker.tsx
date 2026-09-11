// components/admin/ImagePicker.tsx
// Drop-in image field for admin forms: upload a new image, or reuse
// one already uploaded before (banners, dashboard announcement, blog
// covers all share this). Renders the current selection plus a
// "Choose from previous uploads" grid pulled from /api/admin/uploads.
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import { cn } from "@/lib/utils"

interface UploadedFile {
  key: string
  url: string
  uploadedAt: string | null
  size: number
}

interface ImagePickerProps {
  value: string
  onChange: (url: string) => void
  folder?: "banners" | "blog"
  label?: string
}

export function ImagePicker({ value, onChange, folder = "banners", label = "Image" }: ImagePickerProps) {
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previous, setPrevious] = useState<UploadedFile[]>([])
  const [loadingPrevious, setLoadingPrevious] = useState(false)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const headers = await getAuthHeader()
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", folder)

    const res = await fetch("/api/admin/upload", { method: "POST", headers, body: formData })
    const data = await res.json()
    setUploading(false)

    if (res.ok) onChange(data.url)
    else alert(data.error ?? "Upload failed")

    e.target.value = ""
  }

  async function openPicker() {
    setPickerOpen(true)
    setLoadingPrevious(true)
    const headers = await getAuthHeader()
    const res = await fetch(`/api/admin/uploads?folder=${folder}`, { headers })
    const data = await res.json()
    setPrevious(data.files ?? [])
    setLoadingPrevious(false)
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-secondary">{label}</label>

      {value && (
        <img src={value} alt="Selected" className="mb-2 h-20 w-20 rounded-xl border border-border object-cover" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary hover:bg-muted">
          {uploading ? "Uploading..." : "Upload new"}
          <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="hidden" />
        </label>

        <button
          type="button"
          onClick={openPicker}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary hover:bg-muted"
        >
          Choose from previous uploads
        </button>

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-sm text-destructive hover:underline"
          >
            Remove
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-secondary">Previous uploads</h3>
              <button onClick={() => setPickerOpen(false)} className="text-sm text-muted-foreground hover:text-secondary">
                Close
              </button>
            </div>

            {loadingPrevious ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : previous.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous uploads yet. Upload a new image first.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                {previous.map((file) => (
                  <button
                    key={file.key}
                    type="button"
                    onClick={() => {
                      onChange(file.url)
                      setPickerOpen(false)
                    }}
                    className={cn(
                      "aspect-square overflow-hidden rounded-lg border-2 transition hover:border-primary",
                      value === file.url ? "border-primary" : "border-transparent",
                    )}
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
