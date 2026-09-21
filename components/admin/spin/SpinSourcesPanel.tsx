// components/admin/spin/SpinSourcesPanel.tsx
// One card per ticket source: on/off, availability dates, spins per day, expiry,
// daily budget, guarantee, and that source's own settings (milestone days etc).
"use client"

import { useState } from "react"
import {
  adminApi,
  btnGhost,
  btnPrimary,
  Field,
  fmt,
  inputCls,
  koboToNaira,
  nairaToKobo,
  toInputDate,
  Toggle,
  type AdminSource,
  type FieldDef,
} from "@/components/admin/spin/shared"

interface Draft {
  isEnabled: boolean
  startsAt: string
  endsAt: string
  ticketsPerAward: string
  spinsPerDay: string
  expiryMode: "end_of_day" | "hours"
  expiryHours: string
  dailyBudget: string // naira
  guaranteeAfterLosses: string
  config: Record<string, string>
}

function toDraft(s: AdminSource): Draft {
  const config: Record<string, string> = {}
  for (const f of s.fieldDefs) {
    const v = s.config?.[f.key]
    if (f.type === "kobo") config[f.key] = koboToNaira(Number(v ?? 0))
    else if (f.type === "kobo_list") config[f.key] = String(v ?? "").split(",").filter(Boolean).map((k) => String(Number(k) / 100)).join(",")
    else config[f.key] = v === undefined || v === null ? "" : String(v)
  }
  return {
    isEnabled: s.isEnabled,
    startsAt: toInputDate(s.startsAt),
    endsAt: toInputDate(s.endsAt),
    ticketsPerAward: String(s.ticketsPerAward),
    spinsPerDay: String(s.spinsPerDay),
    expiryMode: s.expiryMode,
    expiryHours: String(s.expiryHours),
    dailyBudget: koboToNaira(s.dailyBudgetKobo),
    guaranteeAfterLosses: String(s.guaranteeAfterLosses),
    config,
  }
}

function configPayload(defs: FieldDef[], config: Record<string, string>) {
  const out: Record<string, string | number> = {}
  for (const f of defs) {
    const v = (config[f.key] ?? "").trim()
    if (f.type === "kobo") out[f.key] = nairaToKobo(v)
    else if (f.type === "kobo_list") out[f.key] = v.split(",").map((x) => x.trim()).filter(Boolean).map((x) => String(nairaToKobo(x))).join(",")
    else out[f.key] = v
  }
  return out
}

function SourceCard({ source, onChanged, onNotice }: { source: AdminSource; onChanged: () => void; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState<Draft>(() => toDraft(source))
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const isLazy = source.kind === "lazy"
  const isManual = source.kind === "manual"

  async function save(override?: Partial<Draft>) {
    const payload = { ...d, ...override }
    setSaving(true)
    try {
      await adminApi("/api/admin/spin", {
        method: "POST",
        body: JSON.stringify({
          action: "save_source",
          sourceKey: source.sourceKey,
          isEnabled: payload.isEnabled,
          startsAt: payload.startsAt || null,
          endsAt: payload.endsAt || null,
          ticketsPerAward: Number(payload.ticketsPerAward),
          spinsPerDay: Number(payload.spinsPerDay),
          expiryMode: payload.expiryMode,
          expiryHours: Number(payload.expiryHours),
          dailyBudgetKobo: nairaToKobo(payload.dailyBudget),
          guaranteeAfterLosses: Number(payload.guaranteeAfterLosses),
          config: configPayload(source.fieldDefs, payload.config),
        }),
      })
      onNotice({ ok: true, text: `${source.label} saved.` })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
      setD((prev) => ({ ...prev, ...(override ? { isEnabled: d.isEnabled } : {}) }))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(v: boolean) {
    set({ isEnabled: v })
    await save({ isEnabled: v })
  }

  async function reset() {
    if (!confirm(`Reset "${source.label}" AND its prize table to the safe defaults? Your current prizes for this source will be replaced.`)) return
    setSaving(true)
    try {
      await adminApi("/api/admin/spin", { method: "POST", body: JSON.stringify({ action: "reset_source", sourceKey: source.sourceKey }) })
      onNotice({ ok: true, text: `${source.label} reset to safe defaults.` })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const budget = source.dailyBudgetKobo

  return (
    <section className="rounded-xl border border-border bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Toggle checked={d.isEnabled} onChange={toggleEnabled} disabled={saving} />
          <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left sm:hidden">
            <p className="text-sm font-semibold text-primary">{source.label}</p>
            <p className="text-xs text-secondary">{source.description}</p>
          </button>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="hidden min-w-0 flex-1 text-left sm:block">
          <p className="text-sm font-semibold text-primary">{source.label}</p>
          <p className="text-xs text-secondary">{source.description}</p>
        </button>
        <div className="text-[11px] text-secondary sm:text-right">
          <p>Win chance {source.winChancePercent}% · avg cost {fmt(source.expectedCostPerSpinKobo)}/spin</p>
          <p>
            Today: {source.ticketsIssuedToday} tickets · paid out {fmt(source.spentTodayKobo)}
            {budget > 0 ? ` of ${fmt(budget)}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className={`${btnGhost} self-start sm:self-auto`}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {source.fieldDefs.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {source.fieldDefs.map((f) => (
                <Field key={f.key} label={f.type === "kobo" || f.type === "kobo_list" ? `${f.label} (₦)` : f.label} help={f.help}>
                  <input
                    value={d.config[f.key] ?? ""}
                    onChange={(e) => set({ config: { ...d.config, [f.key]: e.target.value } })}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Available from (UTC)" help="Leave blank to start immediately.">
              <input type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Available until (UTC)" help="Leave blank to run until you switch it off.">
              <input type="datetime-local" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className={inputCls} />
            </Field>
            {!isManual && (
              <Field label={isLazy ? "Spins given each day" : "Tickets per award"} help={isLazy ? "How many free spins a user gets each day (minimum 1)." : "Tickets given each time the user earns one."}>
                <input type="number" min={0} value={d.ticketsPerAward} onChange={(e) => set({ ticketsPerAward: e.target.value })} className={inputCls} />
              </Field>
            )}
            <Field
              label={isLazy ? "Max spins per day" : "Max tickets per user per day"}
              help="The most a single user can receive from this source in one UTC day. 0 = no limit."
            >
              <input type="number" min={0} value={d.spinsPerDay} onChange={(e) => set({ spinsPerDay: e.target.value })} className={inputCls} />
            </Field>
            {!isManual && (
              <>
                <Field label="Unused ticket expires" help="Ends of the UTC day, or a set number of hours after it is earned. After that it is gone.">
                  <select value={d.expiryMode} onChange={(e) => set({ expiryMode: e.target.value as Draft["expiryMode"] })} className={inputCls}>
                    <option value="end_of_day">End of the same day (UTC)</option>
                    <option value="hours">After a set number of hours</option>
                  </select>
                </Field>
                {d.expiryMode === "hours" && (
                  <Field label="Hours until it expires">
                    <input type="number" min={1} value={d.expiryHours} onChange={(e) => set({ expiryHours: e.target.value })} className={inputCls} />
                  </Field>
                )}
              </>
            )}
            <Field label="Daily prize budget (₦)" help="Total prizes this source may pay per UTC day. Once reached, only free outcomes are drawn. 0 = no cap.">
              <input type="number" min={0} step="0.01" value={d.dailyBudget} onChange={(e) => set({ dailyBudget: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Guaranteed prize after N losses" help="After this many no-prize spins in a row, the next spin is guaranteed a small win. 0 = off.">
              <input type="number" min={0} value={d.guaranteeAfterLosses} onChange={(e) => set({ guaranteeAfterLosses: e.target.value })} className={inputCls} />
            </Field>
          </div>

          {isManual && (
            <p className="text-xs text-secondary">
              Gift tickets take their expiry from the Gift tab each time you send them, so no expiry setting is needed here.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save this source"}
            </button>
            <button onClick={reset} disabled={saving} className={btnGhost}>
              Reset to safe defaults
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function SpinSourcesPanel({ sources, onChanged, onNotice }: { sources: AdminSource[]; onChanged: () => void; onNotice: (n: { ok: boolean; text: string }) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        Each way of earning a spin is its own source with its own switch, dates, limits and prize table. Turn any of them on for a competition and off again afterwards.
      </p>
      {sources.map((s) => (
        // key includes updated values so the draft resets after a save/reset reloads the overview
        <SourceCard key={`${s.sourceKey}:${JSON.stringify([s.isEnabled, s.startsAt, s.endsAt, s.spinsPerDay, s.ticketsPerAward, s.expiryMode, s.expiryHours, s.dailyBudgetKobo, s.guaranteeAfterLosses, s.config])}`} source={s} onChanged={onChanged} onNotice={onNotice} />
      ))}
    </div>
  )
}
