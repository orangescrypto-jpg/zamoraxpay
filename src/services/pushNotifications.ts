// src/services/pushNotifications.ts
// Web push subscriptions and delivery. Uses web-push-neo (Web Crypto + fetch),
// so it runs on Cloudflare Workers as well as Node.
//
// VAPID keys follow the admin-editable / write-only pattern used for
// cron_secret: public key readable (browsers need it to subscribe), private
// key write-only (never returned to the browser).
//
// Dead subscriptions (404/410 from the push service) are deleted instead of
// retried forever. Other failures are left alone.

import { sendNotification, generateVAPIDKeys } from "web-push-neo"
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
  image?: string
}

interface VapidDetails {
  subject: string
  publicKey: string
  privateKey: string
}

const SEND_TIMEOUT_MS = 10_000

export async function getVapidPublicKey(nativeDB?: any): Promise<string | null> {
  return getSetting("vapid_public_key", nativeDB)
}

// vapid_private_key is kept out of getAllSettings (same as cron_secret).
export async function getVapidPrivateKey(nativeDB?: any): Promise<string | null> {
  return getSetting("vapid_private_key", nativeDB)
}

// INSERT ... ON CONFLICT, because these keys are generated on first admin
// use and are not pre-seeded in schema.sql.
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

// web-push-neo's key generator is async.
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  return generateVAPIDKeys()
}

async function loadVapidDetails(nativeDB?: any): Promise<VapidDetails | null> {
  const publicKey = await getVapidPublicKey(nativeDB)
  const privateKey = await getVapidPrivateKey(nativeDB)
  if (!publicKey || !privateKey) return null

  const contactEmail = (await getSetting("vapid_contact_email", nativeDB)) || "ZamoraxLogic@gmail.com"
  return { subject: `mailto:${contactEmail}`, publicKey, privateKey }
}

/**
 * Upserts a push subscription. userId is null for anonymous subscribers
 * (banner shown outside the dashboard). When the person later logs in on the
 * same device, call again with their uid to claim the row.
 */
export async function saveSubscription(
  userId: string | null,
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

function toRecord(r: any): PushSubscriptionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
  }
}

async function getSubscriptionsForUser(userId: string, nativeDB?: any): Promise<PushSubscriptionRecord[]> {
  const result = await d1Query(
    "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    [userId],
    nativeDB,
  )
  return (result.results ?? []).map(toRecord)
}

async function getAllSubscriptions(nativeDB?: any): Promise<PushSubscriptionRecord[]> {
  const result = await d1Query(
    "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions",
    [],
    nativeDB,
  )
  return (result.results ?? []).map(toRecord)
}

// Sends one notification. Returns true on success. Prunes the subscription on
// 404/410. Any other failure returns false and leaves the row alone.
async function sendOne(
  sub: PushSubscriptionRecord,
  body: string,
  vapid: VapidDetails,
  nativeDB?: any,
): Promise<boolean> {
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { vapidDetails: vapid, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) } as any,
    )
    return true
  } catch (err: any) {
    const statusCode = err?.statusCode ?? err?.status
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscription(sub.endpoint, nativeDB)
    }
    return false
  }
}

/** Sends a push to every subscription a user has. Returns successful sends. */
export async function sendPushToUser(userId: string, payload: PushPayload, nativeDB?: any): Promise<number> {
  const vapid = await loadVapidDetails(nativeDB)
  if (!vapid) return 0

  const subscriptions = await getSubscriptionsForUser(userId, nativeDB)
  const body = JSON.stringify(payload)
  let sent = 0
  for (const sub of subscriptions) {
    if (await sendOne(sub, body, vapid, nativeDB)) sent++
  }
  return sent
}

/** Sends the same push to a batch of users. Returns total successful sends. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  nativeDB?: any,
): Promise<number> {
  const vapid = await loadVapidDetails(nativeDB)
  if (!vapid) return 0

  const body = JSON.stringify(payload)
  let sent = 0
  for (const userId of userIds) {
    const subscriptions = await getSubscriptionsForUser(userId, nativeDB)
    for (const sub of subscriptions) {
      if (await sendOne(sub, body, vapid, nativeDB)) sent++
    }
  }
  return sent
}

/** Sends the same push to every subscribed endpoint site-wide (broadcasts). */
export async function broadcastPush(payload: PushPayload, nativeDB?: any): Promise<number> {
  const vapid = await loadVapidDetails(nativeDB)
  if (!vapid) return 0

  const subscriptions = await getAllSubscriptions(nativeDB)
  const body = JSON.stringify(payload)
  let sent = 0
  for (const sub of subscriptions) {
    if (await sendOne(sub, body, vapid, nativeDB)) sent++
  }
  return sent
}
