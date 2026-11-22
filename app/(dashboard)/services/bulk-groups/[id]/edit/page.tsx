// app/(dashboard)/services/bulk-groups/[id]/edit/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"

interface ContactBatchNumber {
  phone: string
  label?: string | null
}

export default function EditContactGroupPage() {
  const params = useParams()
  const router = useRouter()
  const batchId = params.id as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [name, setName] = useState("")
  const [numbersText, setNumbersText] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  useEffect(() => {
    async function load() {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/contact-batches/${batchId}`, { headers })
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const data = await res.json()
      setName(data.batch.name)
      setNumbersText((data.batch.numbers ?? []).map((n: ContactBatchNumber) => n.phone).join("\n"))
      setLoading(false)
    }
    load()
  }, [batchId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setSaving(true)

    const headers = await getAuthHeader()
    const res = await fetch(`/api/contact-batches/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name, numbersText }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setResult({ success: false, message: data.error ?? "Could not update group" })
      return
    }

    let message = `Saved "${name}" with ${data.savedCount} number${data.savedCount === 1 ? "" : "s"}.`
    if (data.duplicatesRemoved > 0) {
      message += ` Removed ${data.duplicatesRemoved} duplicate${data.duplicatesRemoved === 1 ? "" : "s"}.`
    }
    if (data.invalidEntries?.length > 0) {
      message += ` Skipped ${data.invalidEntries.length} invalid entr${data.invalidEntries.length === 1 ? "y" : "ies"}: ${data.invalidEntries.slice(0, 5).join(", ")}${data.invalidEntries.length > 5 ? "…" : ""}`
    }
    setResult({ success: true, message })
  }

  if (loading) {
    return <div className="container max-w-md py-8 text-muted-foreground">Loading...</div>
  }

  if (notFound) {
    return (
      <div className="container max-w-md py-8">
        <p className="mb-4 text-sm text-muted-foreground">Group not found.</p>
        <Link href="/dashboard/services/bulk-groups" className="font-medium text-primary hover:underline">
          Back to my saved groups
        </Link>
      </div>
    )
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Edit Group</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Rename this group or update its number list. Saving replaces the full list below — numbers you remove here
        are removed from the group.
      </p>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Group name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Phone numbers</label>
          <textarea
            required
            rows={10}
            value={numbersText}
            onChange={(e) => setNumbersText(e.target.value)}
            placeholder={"Paste or type phone numbers here. Separate by commas, spaces, or new lines e.g.:\n08087654321, 07011223344"}
            className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <span>Valid Nigerian numbers only (11 digits starting with 070, 080, or 090). Max 100 numbers.</span>
          </p>
        </div>

        <button type="submit" disabled={saving || !name.trim() || !numbersText.trim()}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/dashboard/services/bulk-groups" className="font-medium text-primary hover:underline">
          Back to my saved groups
        </Link>
      </p>
    </div>
  )
}
