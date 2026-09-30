// app/(admin)/admin/service-pages/page.tsx
"use client"

import { useEffect, useState } from "react"
import { SimpleBlogEditor } from "@/components/admin/SimpleBlogEditor"
import { createClient } from "@/src/services/providers/supabase/client"
import type { ServicePage, ServicePageFaq, ServicePagePricingRow } from "@/src/types"

export default function AdminServicePagesPage() {
  const [pages, setPages] = useState<ServicePage[]>([])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [tagline, setTagline] = useState("")
  const [content, setContent] = useState("")
  const [networks, setNetworks] = useState("") // comma-separated in the UI
  const [pricing, setPricing] = useState<ServicePagePricingRow[]>([])
  const [faqs, setFaqs] = useState<ServicePageFaq[]>([])
  const [buyButtonLabel, setBuyButtonLabel] = useState("")
  const [buyButtonHref, setBuyButtonHref] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function authHeaders() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadPages() {
    const headers = await authHeaders()
    const res = await fetch("/api/admin/service-pages", { headers })
    const data = await res.json()
    const mapped: ServicePage[] = (data.pages ?? []).map((p: any) => ({
      slug: p.slug,
      title: p.title,
      tagline: p.tagline,
      contentMarkdown: p.content_markdown,
      networks: safeParse(p.networks_json),
      pricing: safeParse(p.pricing_json),
      faqs: safeParse(p.faqs_json),
      buyButtonLabel: p.buy_button_label,
      buyButtonHref: p.buy_button_href,
      metaDescription: p.meta_description,
    }))
    setPages(mapped)
    if (mapped.length && !activeSlug) selectPage(mapped[0])
  }

  function safeParse(raw: unknown): any[] {
    if (!raw || typeof raw !== "string") return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  useEffect(() => {
    loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectPage(page: ServicePage) {
    setActiveSlug(page.slug)
    setTitle(page.title)
    setTagline(page.tagline ?? "")
    setContent(page.contentMarkdown)
    setNetworks(page.networks.join(", "))
    setPricing(page.pricing.length ? page.pricing : [])
    setFaqs(page.faqs.length ? page.faqs : [])
    setBuyButtonLabel(page.buyButtonLabel || "Buy Now")
    setBuyButtonHref(page.buyButtonHref)
    setMetaDescription(page.metaDescription ?? "")
    setSaved(false)
  }

  async function handleSave() {
    if (!activeSlug) return
    setSaving(true)
    const headers = await authHeaders()

    await fetch("/api/admin/service-pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        slug: activeSlug,
        title,
        tagline,
        contentMarkdown: content,
        networks: networks.split(",").map((n) => n.trim()).filter(Boolean),
        pricing,
        faqs,
        buyButtonLabel,
        buyButtonHref,
        metaDescription,
      }),
    })

    setSaving(false)
    setSaved(true)
    loadPages()
  }

  function updatePricingRow(i: number, field: "label" | "value", value: string) {
    setPricing((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }
  function addPricingRow() {
    setPricing((rows) => [...rows, { label: "", value: "" }])
  }
  function removePricingRow(i: number) {
    setPricing((rows) => rows.filter((_, idx) => idx !== i))
  }

  function updateFaq(i: number, field: "question" | "answer", value: string) {
    setFaqs((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }
  function addFaq() {
    setFaqs((rows) => [...rows, { question: "", answer: "" }])
  }
  function removeFaq(i: number) {
    setFaqs((rows) => rows.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <aside className="shrink-0 border-b border-border p-4 lg:w-56 lg:border-b-0 lg:border-r">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Service Pages</h2>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {pages.map((page) => (
            <li key={page.slug} className="shrink-0 lg:shrink">
              <button
                onClick={() => selectPage(page)}
                className={`block whitespace-nowrap rounded-md px-3 py-2 text-left text-sm lg:w-full ${
                  activeSlug === page.slug ? "bg-primary/10 font-medium text-primary" : "text-secondary hover:bg-muted"
                }`}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6">
        {activeSlug ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Page Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Tagline</label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">
                Supported Networks/Providers (comma-separated)
              </label>
              <input
                value={networks}
                onChange={(e) => setNetworks(e.target.value)}
                placeholder="MTN, Airtel, Glo, 9mobile"
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">How It Works (content)</label>
              <SimpleBlogEditor value={content} onChange={setContent} minHeight={300} />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-secondary">Pricing & Fees</label>
                <button onClick={addPricingRow} className="text-xs font-medium text-primary hover:underline">
                  + Add row
                </button>
              </div>
              <div className="space-y-2">
                {pricing.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={row.label}
                      onChange={(e) => updatePricingRow(i, "label", e.target.value)}
                      placeholder="Label"
                      className="w-1/2 rounded-md border border-border px-3 py-2 text-sm"
                    />
                    <input
                      value={row.value}
                      onChange={(e) => updatePricingRow(i, "value", e.target.value)}
                      placeholder="Value"
                      className="w-1/2 rounded-md border border-border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => removePricingRow(i)}
                      className="shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-secondary"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-secondary">FAQs</label>
                <button onClick={addFaq} className="text-xs font-medium text-primary hover:underline">
                  + Add FAQ
                </button>
              </div>
              <div className="space-y-3">
                {faqs.map((f, i) => (
                  <div key={i} className="space-y-1 rounded-md border border-border p-3">
                    <input
                      value={f.question}
                      onChange={(e) => updateFaq(i, "question", e.target.value)}
                      placeholder="Question"
                      className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium"
                    />
                    <textarea
                      value={f.answer}
                      onChange={(e) => updateFaq(i, "answer", e.target.value)}
                      placeholder="Answer"
                      rows={2}
                      className="w-full rounded-md border border-border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => removeFaq(i)}
                      className="text-xs text-muted-foreground hover:text-secondary"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Buy Button Label</label>
                <input
                  value={buyButtonLabel}
                  onChange={(e) => setBuyButtonLabel(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Buy Button Link</label>
                <input
                  value={buyButtonHref}
                  onChange={(e) => setBuyButtonHref(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary">Meta Description (SEO)</label>
              <input
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:w-auto"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {saved && <span className="text-sm text-accent">Saved</span>}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Loading pages...</p>
        )}
      </div>
    </div>
  )
}
