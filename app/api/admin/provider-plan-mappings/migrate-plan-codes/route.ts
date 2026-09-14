// app/api/admin/provider-plan-mappings/migrate-plan-codes/route.ts
// One-off migration endpoint: re-keys existing pricing_rules and
// provider_plan_mappings rows onto canonical plan_codes (see
// planNormalization.ts / planCodeMigration.ts), so plans created
// before normalization existed get the same "same plan, different
// spelling" merging that new syncs already produce.
//
// Defaults to dryRun=true — POST with no body (or {"dryRun":true})
// returns the full change report WITHOUT writing anything. Only a
// request with an EXPLICIT {"dryRun": false} actually mutates data.
// Always run the dry run first and read manualReviewNeeded /
// lowConfidenceSkipped before running for real.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { migratePlanCodes } from "@/src/services/planCodeMigration"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  let dryRun = true
  try {
    const body = await req.json()
    if (body && typeof body.dryRun === "boolean") dryRun = body.dryRun
  } catch {
    // No body / non-JSON body — keep the safe default (dryRun = true).
  }

  try {
    const report = await migratePlanCodes(dryRun, auth.uid)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Migration failed" },
      { status: 500 },
    )
  }
}
