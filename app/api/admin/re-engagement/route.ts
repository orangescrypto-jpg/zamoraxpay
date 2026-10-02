// app/api/admin/re-engagement/route.ts
// New file. Admin manual-trigger gap identified alongside the
// bounded-concurrency fix to fireForUsers() in
// src/services/reEngagementNotifications.ts: this project had no
// admin UI at all for re-engagement, unlike retention and
// weekend-bonus which already have "Run Now" buttons. Follows the
// same pattern as app/api/admin/weekend-bonus/route.ts: requireAdmin,
// call the underlying service function directly
// (runAllReEngagementTriggers — already exported and already runs the
// 6 trigger types concurrently via Promise.all internally), write an
// admin_audit_log row.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { runAllReEngagementTriggers } from "@/src/services/reEngagementNotifications"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const result = await runAllReEngagementTriggers()

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
       VALUES (?, ?, 're_engagement.manual_run', 'push_notification_log', NULL, NULL, ?)`,
      [randomUUID(), auth.uid, JSON.stringify(result)],
    )

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Re-engagement run failed" }, { status: 500 })
  }
}
