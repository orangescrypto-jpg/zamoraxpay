// src/services/config.ts
// Service abstraction layer — admin-controlled runtime configuration.
//
// Reads feature flags, VTU/payment provider enable+priority+credential
// state, and pricing rules from D1. This is what makes the whole app
// "admin-controlled" with no redeploy: nothing in checkout, wallet
// funding, or the VTU router hardcodes a provider or a price — it all
// asks THIS service, which reads the live D1 config tables.

import { d1Query } from "@/lib/d1"
import type {
  FeatureFlag,
  VtuProviderConfig,
  PaymentProviderConfig,
  VtuProviderKey,
  PaymentProviderKey,
  VtuServiceType,
} from "@/src/types"

export async function getFeatureFlags(nativeDB?: any): Promise<FeatureFlag[]> {
  const result = await d1Query("SELECT * FROM feature_flags", [], nativeDB)
  return (result.results ?? []).map((r: any) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    isEnabled: r.is_enabled === 1,
  }))
}

export async function isFeatureEnabled(key: string, nativeDB?: any): Promise<boolean> {
  const result = await d1Query("SELECT is_enabled FROM feature_flags WHERE key = ?", [key], nativeDB)
  const row = result.results?.[0]
  // Default to enabled if the flag hasn't been seeded yet, so a missing
  // row never silently disables a feature nobody configured on purpose.
  return row ? row.is_enabled === 1 : true
}

export async function setFeatureFlag(
  key: string,
  isEnabled: boolean,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    "UPDATE feature_flags SET is_enabled = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?",
    [isEnabled ? 1 : 0, adminUserId, key],
    nativeDB,
  )
}

/**
 * Returns enabled VTU providers that support the given service type,
 * ordered by admin-configured priority (lowest first = tried first).
 * This — not any hardcoded "primary" constant — is what the router
 * consults on every purchase.
 */
export async function getActiveVtuProviders(
  serviceType: VtuServiceType,
  nativeDB?: any,
): Promise<VtuProviderConfig[]> {
  const result = await d1Query(
    "SELECT * FROM vtu_provider_configs WHERE is_enabled = 1 ORDER BY priority ASC",
    [],
    nativeDB,
  )
  return (result.results ?? [])
    .map((r: any) => ({
      providerKey: r.provider_key as VtuProviderKey,
      label: r.label,
      isEnabled: r.is_enabled === 1,
      priority: r.priority,
      supportsServices: JSON.parse(r.supports_services ?? "[]"),
      lastHealthStatus: r.last_health_status,
    }))
    .filter((p: VtuProviderConfig) => p.supportsServices.includes(serviceType))
}

export async function getVtuProviderCredentials(
  providerKey: string,
  nativeDB?: any,
): Promise<Record<string, string>> {
  const result = await d1Query(
    "SELECT credentials_json FROM vtu_provider_configs WHERE provider_key = ?",
    [providerKey],
    nativeDB,
  )
  const row = result.results?.[0]
  if (!row?.credentials_json) return {}
  try {
    return JSON.parse(row.credentials_json)
  } catch {
    return {}
  }
}

export async function getActivePaymentProviders(nativeDB?: any): Promise<PaymentProviderConfig[]> {
  const result = await d1Query(
    "SELECT * FROM payment_provider_configs WHERE is_enabled = 1 ORDER BY priority ASC",
    [],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    providerKey: r.provider_key as PaymentProviderKey,
    label: r.label,
    isEnabled: r.is_enabled === 1,
    priority: r.priority,
  }))
}

export async function getPaymentProviderCredentials(
  providerKey: string,
  nativeDB?: any,
): Promise<Record<string, string>> {
  const result = await d1Query(
    "SELECT credentials_json FROM payment_provider_configs WHERE provider_key = ?",
    [providerKey],
    nativeDB,
  )
  const row = result.results?.[0]
  if (!row?.credentials_json) return {}
  try {
    return JSON.parse(row.credentials_json)
  } catch {
    return {}
  }
}

export async function updateVtuProviderConfig(
  providerKey: string,
  updates: { isEnabled?: boolean; priority?: number; credentials?: Record<string, string> },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.isEnabled !== undefined) {
    sets.push("is_enabled = ?")
    params.push(updates.isEnabled ? 1 : 0)
  }
  if (updates.priority !== undefined) {
    sets.push("priority = ?")
    params.push(updates.priority)
  }
  if (updates.credentials !== undefined) {
    sets.push("credentials_json = ?")
    params.push(JSON.stringify(updates.credentials))
  }
  sets.push("updated_by = ?", "updated_at = datetime('now')")
  params.push(adminUserId, providerKey)

  await d1Query(
    `UPDATE vtu_provider_configs SET ${sets.join(", ")} WHERE provider_key = ?`,
    params,
    nativeDB,
  )
}

export async function updatePaymentProviderConfig(
  providerKey: string,
  updates: { isEnabled?: boolean; priority?: number; credentials?: Record<string, string> },
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.isEnabled !== undefined) {
    sets.push("is_enabled = ?")
    params.push(updates.isEnabled ? 1 : 0)
  }
  if (updates.priority !== undefined) {
    sets.push("priority = ?")
    params.push(updates.priority)
  }
  if (updates.credentials !== undefined) {
    sets.push("credentials_json = ?")
    params.push(JSON.stringify(updates.credentials))
  }
  sets.push("updated_by = ?", "updated_at = datetime('now')")
  params.push(adminUserId, providerKey)

  await d1Query(
    `UPDATE payment_provider_configs SET ${sets.join(", ")} WHERE provider_key = ?`,
    params,
    nativeDB,
  )
}
