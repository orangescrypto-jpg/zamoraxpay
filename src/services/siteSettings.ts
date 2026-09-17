// src/services/siteSettings.ts
// Service abstraction layer — generic admin-editable key/value
// settings (homepage post count, related post count, cashback rules,
// etc). Booleans are stored as the string "true"/"false"; numbers as
// numeric strings — callers use the typed getters below rather than
// reading `.value` directly.

import { d1Query } from "@/lib/d1"

export interface SiteSetting {
  key: string
  label: string
  description: string | null
  value: string
  valueType: "number" | "text" | "boolean"
}

export async function getAllSettings(nativeDB?: any): Promise<SiteSetting[]> {
  const result = await d1Query("SELECT * FROM site_settings ORDER BY key", [], nativeDB)
  return (result.results ?? []).map((r: any) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    value: r.value,
    valueType: r.value_type,
  }))
}

export async function getSetting(key: string, nativeDB?: any): Promise<string | null> {
  const result = await d1Query("SELECT value FROM site_settings WHERE key = ?", [key], nativeDB)
  return result.results?.[0]?.value ?? null
}

export async function getSettingNumber(key: string, fallback: number, nativeDB?: any): Promise<number> {
  const raw = await getSetting(key, nativeDB)
  if (raw === null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function getSettingBoolean(key: string, fallback: boolean, nativeDB?: any): Promise<boolean> {
  const raw = await getSetting(key, nativeDB)
  if (raw === null) return fallback
  return raw === "true"
}

export async function updateSetting(key: string, value: string, adminUserId: string, nativeDB?: any): Promise<void> {
  await d1Query(
    "UPDATE site_settings SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?",
    [value, adminUserId, key],
    nativeDB,
  )
}

// cron_secret is deliberately kept out of getAllSettings/GET /api/admin/settings —
// it's an auth credential, not a displayable setting, and must never be sent
// back to the browser. Only this getter (used by cron routes) and the
// dedicated rotate endpoint (write-only) touch it.
export async function getCronSecret(nativeDB?: any): Promise<string | null> {
  return getSetting("cron_secret", nativeDB)
}

export async function setCronSecret(value: string, adminUserId: string, nativeDB?: any): Promise<void> {
  await d1Query(
    `INSERT INTO site_settings (key, label, description, value, value_type, updated_by, updated_at)
     VALUES ('cron_secret', 'Cron Secret', 'Bearer token required by scheduled job endpoints. Write-only — never displayed.', ?, 'text', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    [value, adminUserId],
    nativeDB,
  )
}
