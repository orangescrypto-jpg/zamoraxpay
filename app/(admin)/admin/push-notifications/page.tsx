// app/(admin)/admin/push-notifications/page.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"
import type { FeatureFlag } from "@/src/types"
import type { SiteSetting } from "@/src/services/siteSettings"

const PUSH_FLAG_KEYS = [
  "push_streak_at_risk",
  "push_unclaimed_reward",
  "push_wallet_idle",
  "push_weekend_bonus_live",
  "push_referral_nudge",
  "push_inactivity_winback",
]

export default function AdminPushNotificationsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [settings, setSettings] = useState<SiteSetting[]>([])
  const [vapidConfigured, setVapidConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  async function getAuthHeader() {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    const headers = await getAuthHeader()
    const [flagsRes, pushRes] = await Promise.all([
      fetch("/api/admin/feature-flags", { headers }),
      fetch("/api/admin/push-notifications", { headers }),
    ])
    const flagsData = await flagsRes.json()
    const pushData = await pushRes.json()

    setFlags((flagsData.flags ?? []).filter((f: FeatureFlag) => PUSH_FLAG_KEYS.includes(f.key)))
    setSettings(pushData.settings ?? [])
    setVapidConfigured(!!pushData.vapidConfigured)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggle(flag: FeatureFlag) {
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, isEnabled: !f.isEnabled } : f)))
    const headers = await getAuthHeader()
    await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ key: flag.key, isEnabled: !flag.isEnabled }),
    })
  }

  async function generateKeys() {
    setGenerating(true)
    const headers = await getAuthHeader()
    await fetch("/api/admin/push-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ action: "generate_vapid_keys" }),
    })
    setGenerating(false)
    await load()
  }

  async function saveSettingValue(key: string, value: string) {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
    const headers = await getAuthHeader()
    await fetch("/api/admin/push-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ key, value }),
    })
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-heading font-bold">Push Notifications</h1>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="max-w-2xl space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-secondary">VAPID Keys</h2>
            <div className="rounded-lg border border-border bg-white p-4">
              {vapidConfigured ? (
                <p className="text-sm text-muted-foreground">
                  Push notifications are configured. Regenerating will invalidate all existing device subscriptions —
                  users will need to re-enable push on their next visit.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No VAPID keys configured yet. Generate a key pair to enable push notifications.
                </p>
              )}
              <button
                onClick={generateKeys}
                disabled={generating}
                className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {generating ? "Generating..." : vapidConfigured ? "Regenerate Keys" : "Generate Keys"}
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-secondary">Comeback Triggers</h2>
            <div className="space-y-2">
              {flags.map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between rounded-lg border border-border bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-secondary">{flag.label}</p>
                    {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                  </div>
                  <button
                    onClick={() => toggle(flag)}
                    className={`h-6 w-11 rounded-full transition-colors ${flag.isEnabled ? "bg-accent" : "bg-muted"}`}
                  >
                    <span
                      className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
                        flag.isEnabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {settings.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-secondary">Thresholds</h2>
              <div className="space-y-2">
                {settings.map((setting) => (
                  <div key={setting.key} className="rounded-lg border border-border bg-white p-4">
                    <label className="text-sm font-medium text-secondary">{setting.label}</label>
                    {setting.description && (
                      <p className="mb-2 text-xs text-muted-foreground">{setting.description}</p>
                    )}
                    <input
                      type={setting.valueType === "number" ? "number" : "text"}
                      defaultValue={setting.value}
                      onBlur={(e) => saveSettingValue(setting.key, e.target.value)}
                      className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
