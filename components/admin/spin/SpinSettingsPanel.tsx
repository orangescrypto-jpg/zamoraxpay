// components/admin/spin/SpinSettingsPanel.tsx
// Master switch + every global knob: popup, anti-abuse limits, winner feed, push.
"use client"

import { useEffect, useState } from "react"
import { adminApi, btnPrimary, inputCls, koboToNaira, nairaToKobo, Toggle, type AdminOverview } from "@/components/admin/spin/shared"

export function SpinSettingsPanel({ data, onChanged, onNotice }: { data: AdminOverview; onChanged: () => void; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [masterSaving, setMasterSaving] = useState(false)

  useEffect(() => {
    const v: Record<string, string> = {}
    for (const s of data.settings) v[s.key] = s.key.endsWith("_kobo") ? koboToNaira(Number(s.value)) : s.value
    setValues(v)
  }, [data])

  async function setMaster(enabled: boolean) {
    setMasterSaving(true)
    try {
      await adminApi("/api/admin/spin", { method: "POST", body: JSON.stringify({ action: "set_master", enabled }) })
      onNotice({ ok: true, text: enabled ? "Spin & Win is ON for everyone." : "Spin & Win is OFF. Nothing is shown and no tickets are issued." })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setMasterSaving(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      for (const s of data.settings) {
        const raw = values[s.key] ?? s.value
        payload[s.key] = s.type === "boolean" ? raw : s.key.endsWith("_kobo") ? String(nairaToKobo(raw)) : raw
      }
      await adminApi("/api/admin/spin", { method: "POST", body: JSON.stringify({ action: "save_settings", settings: payload }) })
      onNotice({ ok: true, text: "Settings saved." })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white p-5">
        <div>
          <h2 className="text-base font-semibold text-primary">Spin &amp; Win master switch</h2>
          <p className="mt-1 text-xs text-secondary">
            Off = the spin card and popup disappear, no tickets are issued and nobody can spin. Tickets already earned stay until they expire.
          </p>
        </div>
        <Toggle checked={data.enabled} onChange={setMaster} disabled={masterSaving} label={data.enabled ? "On" : "Off"} />
      </section>

      <section className="rounded-xl border border-border bg-white p-5">
        <h2 className="text-base font-semibold text-primary">Global settings</h2>
        <div className="mt-4 divide-y divide-border">
          {data.settings.map((s) => {
            const isKobo = s.key.endsWith("_kobo")
            return (
              <div key={s.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="sm:max-w-md">
                  <p className="text-sm font-semibold text-primary">{isKobo ? s.label.replace(" (kobo)", " (₦)") : s.label}</p>
                  <p className="text-xs text-secondary">{s.description}</p>
                </div>
                {s.type === "boolean" ? (
                  <Toggle
                    checked={(values[s.key] ?? s.value) === "true"}
                    onChange={(v) => setValues({ ...values, [s.key]: v ? "true" : "false" })}
                    label={(values[s.key] ?? s.value) === "true" ? "On" : "Off"}
                  />
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={isKobo ? "0.01" : "1"}
                    value={values[s.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
                    className={`${inputCls} sm:w-40`}
                  />
                )}
              </div>
            )
          })}
        </div>
        <button onClick={save} disabled={saving} className={`${btnPrimary} mt-4`}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </section>
    </div>
  )
}
