// app/api/admin/spin/route.ts
// Everything on the Spin & Win admin page except prizes (own route), gifting and the log.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
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
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const status = err instanceof SpinAdminError ? 400 : 500
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status })
  }
}
