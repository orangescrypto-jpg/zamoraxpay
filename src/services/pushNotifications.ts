// src/services/pushNotifications.ts
// Service abstraction layer — web push subscriptions and delivery.
//
// VAPID keys follow the same admin-editable / write-only pattern as
// cron_secret in siteSettings.ts: public key readable (client needs
// it to subscribe), private key write-only (never sent back to the
// browser, only read server-side to sign pushes).
//
// Subscriptions are stored per-user in push_subscriptions (a user can
// have more than one — multiple devices/browsers). Sending is best
// effort: a 404/410 from the push service means the subscription is
// gone (user uninstalled, cleared data, etc) and we delete it instead
// of retrying forever.

import webpush from "web-push"
import { randomUUID } from "crypto"
import { d1Query } from "@/lib/d1"
import { getSetting } from "@/src/services/siteSettings"

export interface PushSubscriptionRecord {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function getVapidPublicKey(nativeDB?: any): Promise<string | null> {
  return getSetting("vapid_public_key", nativeDB)
}

// vapid_private_key is deliberately kept out of getAllSettings (same
// treatment as cron_secret) — it's a signing credential, not a
// displayable setting. Only this getter and saveVapidKeys touch it.
export async function getVapidPrivateKey(nativeDB?: any): Promise<string | null> {
  return getSetting("vapid_private_key", nativeDB)
}

// Uses INSERT ... ON CONFLICT rather than a plain UPDATE (like
// updateSetting) because these two keys are generated on first admin
// use, not pre-seeded in schema.sql — a plain UPDATE would silently
// no-op against a row that doesn't exist yet.
export async function saveVapidKeys(
  publicKey: string,
  privateKey: string,
  adminUserId: string,
  nativeDB?: any,
): Promise<void> {
  await d1Query(
    `INSERT INTO site_settings (key, label, description, value, value_type, updated_by, updated_at)
     VALUES ('vapid_public_key', 'VAPID Public Key', 'Public key browsers use to subscribe to push notifications.', ?, 'text', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    [publicKey, adminUserId],
    nativeDB,
  )
  await d1Query(
    `INSERT INTO site_settings (key, label, description, value, value_type, updated_by, updated_at)
     VALUES ('vapid_private_key', 'VAPID Private Key', 'Signing key for push notifications. Write-only — never displayed.', ?, 'text', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    [privateKey, adminUserId],
    nativeDB,
  )
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys()
}

async function configureWebPush(nativeDB?: any): Promise<boolean> {
  const publicKey = await getVapidPublicKey(nativeDB)
  const privateKey = await getVapidPrivateKey(nativeDB)
  if (!publicKey || !privateKey) return false

  const contactEmail = (await getSetting("vapid_contact_email", nativeDB)) || "support@zamoraxpay.com"
  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey)
  return true
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  nativeDB?: any,
): Promise<void> {
  const existing = await d1Query(
    "SELECT id FROM push_subscriptions WHERE endpoint = ?",
    [subscription.endpoint],
    nativeDB,
  )
  if (existing.results?.[0]) {
    await d1Query(
      "UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, updated_at = datetime('now') WHERE endpoint = ?",
      [userId, subscription.keys.p256dh, subscription.keys.auth, subscription.endpoint],
      nativeDB,
    )
    return
  }

  await d1Query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
    nativeDB,
  )
}

export async function removeSubscription(endpoint: string, nativeDB?: any): Promise<void> {
  await d1Query("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint], nativeDB)
}

async function getSubscriptionsForUser(userId: string, nativeDB?: any): Promise<PushSubscriptionRecord[]> {
  const result = await d1Query(
    "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    [userId],
    nativeDB,
  )
  return (result.results ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
  }))
}

/**
 * Sends a push to every subscription a user has. Returns how many
 * sends succeeded. Dead subscriptions (410 Gone / 404) are pruned
 * automatically. Silently no-ops (returns 0) if VAPID keys aren't
 * configured yet, so calling this from a cron job before an admin has
 * set up push is safe rather than throwing.
 */
export async function sendPushToUser(userId: string, payload: PushPayload, nativeDB?: any): Promise<number> {
  const configured = await configureWebPush(nativeDB)
  if (!configured) return 0

  const subscriptions = await getSubscriptionsForUser(userId, nativeDB)
  if (subscriptions.length === 0) return 0

  let sent = 0
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      )
      sent++
    } catch (err: any) {
      const statusCode = err?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await removeSubscription(sub.endpoint, nativeDB)
      }
      // Other errors (network blip, service outage) are left alone —
      // the subscription may still be valid on the next attempt.
    }
  }
  return sent
}

/**
 * Sends the same push to a batch of user IDs. Used by the
 * re-engagement cron jobs, which fan out to many users per run.
 * Returns total successful sends across all users.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  nativeDB?: any,
): Promise<number> {
  const configured = await configureWebPush(nativeDB)
  if (!configured) return 0

  let sent = 0
  for (const userId of userIds) {
    sent += await sendPushToUser(userId, payload, nativeDB)
  }
  return sent
}
