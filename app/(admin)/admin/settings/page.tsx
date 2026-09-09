
// app/(admin)/admin/settings/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import type { SiteSetting } from "@/src/services/siteSettings"

const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Homepage & Blog", keys: ["homepage_post_count", "related_post_count"] },
  { title: "Reseller", keys: ["reseller_upgrade_fee_kobo"] },
  {
    title: "Withdrawal",
    keys: ["withdrawal_min_amount_kobo", "withdrawal_fee_kobo", "withdrawal_payout_method"],
  },
  {
    title: "Cashback",
    keys: [
      "cashback_enabled",
      "cashback_min_amount_kobo",
      "cashback_type",
      "cashback_percentage",
      "cashback_flat_amount_kobo",
      "cashback_max_amount_kobo",
    ],
  },
  { title: "WhatsApp Support", keys: ["whatsapp_support_enabled", "whatsapp_support_number"] },
  { title: "Signup Bonus", keys: ["signup_bonus_amount_kobo"] },
  { title: "Weekend Bonus", keys: ["weekend_bonus_amount_kobo", "weekend_bonus_days"] },
  {
    title: "Airtime to Cash",
    keys: ["airtime_to_cash_discount_percent", "airtime_to_cash_contact_phone", "airtime_to_cash_contact_email"],
  },
]

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, SiteSetting>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  async function getAuthHeader() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const res = await fetch("/api/admin/settings", { headers })
    const data = await res.json()
    const map: Record<string, SiteSetting> = {}
    for (const s of data.settings ?? []) map[s.key] = s
    setSettings(map)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function save(key: string, value: string) {
    setSaving(key)
    const headers = await getAuthHeader()
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ key, value }),
    })
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], value } }))
    setSaving(null)
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-heading font-bold">Site Settings</h1>

      {GROUPS.map((group) => (
        <div key={group.title}>
          <h2 className="mb-3 font-heading font-semibold text-secondary">{group.title}</h2>
          <div className="space-y-3">
            {group.keys.map((key) => {
              const setting = settings[key]
              if (!setting) return null
              return <SettingField key={key} setting={setting} onSave={save} saving={saving === key} />
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function SettingField({
  setting,
  onSave,
  saving,
}: {
  setting: SiteSetting
  onSave: (key: string, value: string) => void
  saving: boolean
}) {
  const isKobo = setting.valueType === "number" && setting.key.endsWith("_kobo")

  // Kobo-denominated settings are stored and read as kobo everywhere
  // else in the app (pricing, wallet debits, etc.) — but admins think
  // in naira. This field shows/accepts naira and converts at the
  // boundary, so the stored value never changes shape.
  const [naira, setNaira] = useState(() => (isKobo ? String(Number(setting.value) / 100) : setting.value))
  const [value, setValue] = useState(setting.value)
  const dirty = isKobo ? naira !== String(Number(setting.value) / 100) : value !== setting.value

  function handleSave() {
    if (isKobo) {
      const kobo = Math.round(parseFloat(naira || "0") * 100)
      onSave(setting.key, String(kobo))
    } else {
      onSave(setting.key, value)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-secondary">{setting.label}</label>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
      {setting.description && <p className="mb-2 text-xs text-muted-foreground">{setting.description}</p>}

      {setting.valueType === "boolean" ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      ) : setting.key === "cashback_type" ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <option value="percentage">Percentage</option>
          <option value="flat">Flat amount</option>
        </select>
      ) : isKobo ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₦</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={naira}
            onChange={(e) => setNaira(e.target.value)}
            className="w-full rounded-md border border-border py-1.5 pl-7 pr-3 text-sm"
          />
        </div>
      ) : (
        <input
          type={setting.valueType === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      )}
    </div>
  )
}
