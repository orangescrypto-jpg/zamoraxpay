// app/(dashboard)/services/bulk-groups/new/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/src/services/providers/supabase/client"

export default function CreateContactGroupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [numbersText, setNumbersText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch("/api/contact-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ name, numbersText }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setResult({ success: false, message: data.error ?? "Could not create group" })
      return
    }

    let message = `Saved ${data.savedCount} number${data.savedCount === 1 ? "" : "s"} to "${name}".`
    if (data.duplicatesRemoved > 0) {
      message += ` Removed ${data.duplicatesRemoved} duplicate${data.duplicatesRemoved === 1 ? "" : "s"}.`
    }
    if (data.invalidEntries?.length > 0) {
      message += ` Skipped ${data.invalidEntries.length} invalid entr${data.invalidEntries.length === 1 ? "y" : "ies"}: ${data.invalidEntries.slice(0, 5).join(", ")}${data.invalidEntries.length > 5 ? "…" : ""}`
    }
    setResult({ success: true, message })
    setName("")
    setNumbersText("")
  }

  return (
    <div className="container max-w-md py-8">
      <h1 className="mb-1 text-2xl font-heading font-bold text-secondary">Create Group</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Save a list of numbers once, then reuse it for bulk airtime or data purchases.
      </p>

      {result && (
        <p className={`mb-4 rounded-md p-3 text-sm ${result.success ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
          {result.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Group name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family, Staff, Cybercafé customers"
            className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-secondary">Phone numbers</label>
          <textarea
            required
            rows={6}
            value={numbersText}
            onChange={(e) => setNumbersText(e.target.value)}
            placeholder={"Paste or type phone numbers here. Separate by commas, spaces, or new lines e.g.:\n08087654321, 07011223344"}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <span>Valid Nigerian numbers only (11 digits starting with 070, 080, or 090). Max 100 numbers.</span>
          </p>
        </div>

        <button type="submit" disabled={loading || !name.trim() || !numbersText.trim()}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? "Processing..." : "Process Numbers"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/services/bulk-groups" className="font-medium text-primary hover:underline">
          View my saved groups
        </Link>
      </p>
    </div>
  )
}
