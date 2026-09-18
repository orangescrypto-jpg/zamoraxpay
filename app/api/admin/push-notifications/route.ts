// app/api/admin/push-notifications/route.ts
// Admin-only: generate/view VAPID public key status, and read/update
// the per-trigger threshold settings used by the re-engagement cron.
// Mirrors the write-only-credential pattern used for cron_secret: the
// private key is never returned in the GET response.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import { d1Query } from "@/lib/db"
import {
  getVapidPublicKey,
  getVapidPrivateKey,
  generateVapidKeys,
  saveVapidKeys,
} from "@/src/services/pushNotifications"
import { getAllSettings, updateSetting } from "@/src/services/siteSettings"

const RE_ENGAGEMENT_SETTING_KEYS = [
  "push_unclaimed_reward_min_age_days",
  "push_wallet_idle_min_balance_kobo",
  "push_wallet_idle_days",
  "vapid_contact_email",
]

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const publicKey = await getVapidPublicKey()
  const privateKey = await getVapidPrivateKey()
  const allSettings = await getAllSettings()
  const settings = allSettings.filter((s) => RE_ENGAGEMENT_SETTING_KEYS.includes(s.key))

  return NextResponse.json({
    vapidConfigured: !!(publicKey && privateKey),
    vapidPublicKey: publicKey,
    settings,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { action } = await req.json()

    if (action === "generate_vapid_keys") {
      const { publicKey, privateKey } = generateVapidKeys()
      await saveVapidKeys(publicKey, privateKey, auth.uid)

      await d1Query(
        `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
         VALUES (?, ?, 'push.vapid_keys_generated', 'site_settings', 'vapid_keys', NULL, ?)`,
        [randomUUID(), auth.uid, JSON.stringify({ publicKey })],
      )

      return NextResponse.json({ success: true, publicKey })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Request failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const { key, value } = await req.json()
    if (!key || typeof value !== "string" || !RE_ENGAGEMENT_SETTING_KEYS.includes(key)) {
      return NextResponse.json({ error: "Unsupported setting key" }, { status: 400 })
    }

    await updateSetting(key, value, auth.uid)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}
