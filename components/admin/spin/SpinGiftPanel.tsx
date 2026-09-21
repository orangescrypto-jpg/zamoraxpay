// components/admin/spin/SpinGiftPanel.tsx
// Send spin tickets by hand: one user, a whole tier, or everyone.
"use client"

import { useState } from "react"
import { adminApi, btnPrimary, Field, inputCls, Toggle, type AdminOverview } from "@/components/admin/spin/shared"

export function SpinGiftPanel({ data, onNotice }: { data: AdminOverview; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const [target, setTarget] = useState<"user" | "tier" | "all">("user")
  const [identifier, setIdentifier] = useState("")
  const [tier, setTier] = useState("reseller")
  const [count, setCount] = useState("1")
  const [expiryMode, setExpiryMode] = useState<"hours" | "endOfDay">("hours")
  const [hours, setHours] = useState("24")
  const [note, setNote] = useState("")
  const [notify, setNotify] = useState(true)
  const [sending, setSending] = useState(false)

  const giftOn = data.sources.find((s) => s.sourceKey === "admin_gift")?.isEnabled ?? false

  async function send() {
    if (target === "all" && !confirm(`Send ${count} free spin(s) to EVERY active user?`)) return
    setSending(true)
    try {
      const r = await adminApi<{ users: number; tickets: number }>("/api/admin/spin/gift", {
        method: "POST",
        body: JSON.stringify({
          target,
          identifier,
          tier,
          count: Number(count),
          endOfDay: expiryMode === "endOfDay",
          expiresInHours: Number(hours),
          note,
          notify,
        }),
      })
      onNotice({ ok: true, text: `Sent ${r.tickets} ticket${r.tickets === 1 ? "" : "s"} to ${r.users} user${r.users === 1 ? "" : "s"}.` })
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {!giftOn && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          The &quot;Admin gift tickets&quot; source is switched off. Turn it on in the Sources tab before sending.
        </p>
      )}
      <p className="text-sm text-secondary">
        Gift tickets use the prize table of the &quot;Admin gift tickets&quot; source. Like every ticket, an unused gift disappears when it expires.
      </p>

      <section className="space-y-4 rounded-xl border border-border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Send to">
            <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} className={inputCls}>
              <option value="user">One user</option>
              <option value="tier">Everyone in a tier</option>
              <option value="all">Every active user</option>
            </select>
          </Field>
          {target === "user" && (
            <Field label="Email, phone or user ID">
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
            </Field>
          )}
          {target === "tier" && (
            <Field label="Tier">
              <input value={tier} onChange={(e) => setTier(e.target.value)} className={inputCls} placeholder="reseller" />
            </Field>
          )}
          <Field label="Tickets each" help="1 to 20.">
            <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Expires">
            <select value={expiryMode} onChange={(e) => setExpiryMode(e.target.value as typeof expiryMode)} className={inputCls}>
              <option value="hours">After a set number of hours</option>
              <option value="endOfDay">End of today (UTC)</option>
            </select>
          </Field>
          {expiryMode === "hours" && (
            <Field label="Hours until it expires">
              <input type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} />
            </Field>
          )}
          <Field label="Note (optional)">
            <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Gift from ZamoraxPay" />
          </Field>
        </div>
        <Toggle checked={notify} onChange={setNotify} label="Send a push notification to recipients who have push enabled" />
        <button onClick={send} disabled={sending || !giftOn} className={btnPrimary}>
          {sending ? "Sending…" : "Send tickets"}
        </button>
      </section>
    </div>
  )
}
