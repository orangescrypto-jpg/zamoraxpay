// app/api/admin/spin/route.ts
// Everything on the Spin & Win admin page except prizes (own route), gifting and the log.
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"
import { getCronSecret } from "@/src/services/siteSettings"
import { GET as spinCron } from "@/app/api/cron/spin/route"
import {
  SpinAdminError,
  deleteTierBonus,
  getAdminOverview,
  resetSource,
  saveSettings,
  saveSource,
  saveTierBonus,
  setMaster,
} from "@/src/services/spinAdmin"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error
  try {
    return NextResponse.json(await getAdminOverview())
  } catch (err) {
    return NextResponse.json(
      { error: "Spin & Win tables are missing. Run migrations/spin_and_win.sql against your D1 database, then reload.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// POST { action, ... }
//   set_master        { enabled }
//   save_settings     { settings: { key: value } }
//   save_source       { sourceKey, isEnabled, startsAt, endsAt, ticketsPerAward, spinsPerDay, expiryMode, expiryHours, dailyBudgetKobo, guaranteeAfterLosses, dailyResetTime, config }
//   reset_source      { sourceKey }            — restore that source + its prize table to shipped defaults
//   save_tier_bonus   { tierKey, sourceKey, extraTickets, weightBoostPercent, isActive }
//   delete_tier_bonus { tierKey, sourceKey }
//   run_cron          {}                       — new: run the spin cron sweep manually now
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    switch (body?.action) {
      case "set_master":
        await setMaster(Boolean(body.enabled), auth.uid)
        break
      case "save_settings":
        await saveSettings(body.settings ?? {}, auth.uid)
        break
      case "save_source":
        await saveSource(body, auth.uid)
        break
      case "reset_source":
        await resetSource(String(body.sourceKey ?? ""), auth.uid)
        break
      case "save_tier_bonus":
        await saveTierBonus(body, auth.uid)
        break
      case "delete_tier_bonus":
        await deleteTierBonus(String(body.tierKey ?? ""), String(body.sourceKey ?? ""), auth.uid)
        break
      case "run_cron": {
        // app/api/admin/spin/route.ts — run_cron action. New. Admin
        // manual-trigger gap: /admin/spin had settings/stats but no
        // run button. Spin only exists as a cron route export (no
        // standalone service function), so this calls the cron
        // route's own exported GET handler in-process, same pattern
        // as the other admin trigger routes added alongside it —
        // no sweep logic duplicated here.
        const secret = (await getCronSecret()) || process.env.CRON_SECRET
        if (!secret) {
          return NextResponse.json({ error: "Cron secret is not configured; cannot run this job." }, { status: 500 })
        }
        const cronReq = new NextRequest(new URL("/api/cron/spin", req.url), {
          headers: { authorization: `Bearer ${secret}` },
        })
        const cronRes = await spinCron(cronReq)
        const result = await cronRes.json()

        await d1Query(
          `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, before_json, after_json)
           VALUES (?, ?, 'spin.manual_run', 'spin_tickets', NULL, NULL, ?)`,
          [randomUUID(), auth.uid, JSON.stringify(result)],
        )
        return NextResponse.json(result, { status: cronRes.status })
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const status = err instanceof SpinAdminError ? 400 : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status })
  }
}
