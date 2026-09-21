// components/admin/spin/SpinTierPanel.tsx
// Loyalty-tier bonus: extra tickets and/or better odds per tier, per source (or all).
"use client"

import { useState } from "react"
import { adminApi, btnGhost, btnPrimary, Field, inputCls, Toggle, type AdminOverview } from "@/components/admin/spin/shared"

export function SpinTierPanel({ data, onChanged, onNotice }: { data: AdminOverview; onChanged: () => void; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const [tierKey, setTierKey] = useState("reseller")
  const [sourceKey, setSourceKey] = useState("*")
  const [extra, setExtra] = useState("1")
  const [boost, setBoost] = useState("0")
  const [saving, setSaving] = useState(false)

  const sourceLabel = (k: string) => (k === "*" ? "Every source" : data.sources.find((s) => s.sourceKey === k)?.label ?? k)

  async function save(input: { tierKey: string; sourceKey: string; extraTickets: number; weightBoostPercent: number; isActive: boolean }) {
    setSaving(true)
    try {
      await adminApi("/api/admin/spin", { method: "POST", body: JSON.stringify({ action: "save_tier_bonus", ...input }) })
      onNotice({ ok: true, text: "Tier bonus saved." })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: string, s: string) {
    if (!confirm("Remove this tier bonus?")) return
    try {
      await adminApi("/api/admin/spin", { method: "POST", body: JSON.stringify({ action: "delete_tier_bonus", tierKey: t, sourceKey: s }) })
      onNotice({ ok: true, text: "Tier bonus removed." })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-secondary">
        Reward your best customers. A tier can get extra tickets each time a source pays out, and/or a boost to the chance of every real prize. Tiers today are the account tiers (<code>retail</code>, <code>reseller</code>); a bonus for a source overrides the &quot;every source&quot; bonus.
      </p>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold text-primary">Add or change a tier bonus</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tier">
            <input value={tierKey} onChange={(e) => setTierKey(e.target.value)} className={inputCls} placeholder="reseller" />
          </Field>
          <Field label="Applies to">
            <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} className={inputCls}>
              <option value="*">Every source</option>
              {data.sources.map((s) => (
                <option key={s.sourceKey} value={s.sourceKey}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Extra tickets" help="Added to every award (0-20).">
            <input type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Odds boost %" help="Raises the chance of every real prize by this %. 0 = none.">
            <input type="number" min={0} value={boost} onChange={(e) => setBoost(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <button
          className={`${btnPrimary} mt-4`}
          disabled={saving}
          onClick={() => save({ tierKey, sourceKey, extraTickets: Number(extra), weightBoostPercent: Number(boost), isActive: true })}
        >
          {saving ? "Saving…" : "Save tier bonus"}
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-secondary">
            <tr>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Extra tickets</th>
              <th className="px-3 py-2">Odds boost</th>
              <th className="px-3 py-2">On</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.tierBonuses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-secondary">
                  No tier bonuses yet.
                </td>
              </tr>
            )}
            {data.tierBonuses.map((t) => (
              <tr key={`${t.tierKey}:${t.sourceKey}`}>
                <td className="px-3 py-2 font-medium text-primary">{t.tierKey}</td>
                <td className="px-3 py-2">{sourceLabel(t.sourceKey)}</td>
                <td className="px-3 py-2">+{t.extraTickets}</td>
                <td className="px-3 py-2">+{t.weightBoostPercent}%</td>
                <td className="px-3 py-2">
                  <Toggle checked={t.isActive} onChange={(v) => save({ ...t, isActive: v })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button className={btnGhost} onClick={() => remove(t.tierKey, t.sourceKey)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
