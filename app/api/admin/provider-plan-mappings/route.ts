// app/api/admin/provider-plan-mappings/route.ts
// Admin control for cross-provider plan mappings — this is where you
// tell the system "our MTN 200MB/1-Day plan is Pairgate's plan_id 12
// at ₦92, AND CheapDataHub's bundle_id 45 at ₦100" so the VTU router
// (src/services/vtuRouter.ts) can try the cheaper one first
// automatically instead of a fixed priority order.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import {
  listPlanMappings,
  upsertPlanMapping,
  setPlanMappingActive,
  deletePlanMapping,
} from "@/src/services/providerPlanMappings"
import { d1Query } from "@/lib/db"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType") ?? undefined
  const networkOrBiller = req.nextUrl.searchParams.get("networkOrBiller") ?? undefined
  const planCode = req.nextUrl.searchParams.get("planCode") ?? undefined

  const mappings = await listPlanMappings({
    serviceType: serviceType as any,
    networkOrBiller: networkOrBiller ?? undefined,
    planCode: planCode ?? undefined,
  })

  return NextResponse.json({ mappings })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.error

    const body = await req.json()
    const {
      id,
      serviceType,
      networkOrBiller,
      planCode,
      providerKey,
      providerPlanId,
      providerCostKobo,
      providerPlanLabel,
    } = body

    if (!serviceType || !networkOrBiller || !planCode || !providerKey || !providerPlanId || providerCostKobo == null) {
      return NextResponse.json(
        {
          error:
            "serviceType, networkOrBiller, planCode, providerKey, providerPlanId, and providerCostKobo are all required",
        },
        { status: 400 },
      )
    }

    await upsertPlanMapping(
      {
        id,
        serviceType,
        networkOrBiller,
        planCode,
        providerKey,
        providerPlanId,
        providerCostKobo,
        providerPlanLabel,
      },
      auth.uid,
    )

    await d1Query(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, after_json)
       VALUES (?, ?, 'provider_plan_mapping.upsert', 'provider_plan_mappings', ?, ?)`,
      [randomUUID(), auth.uid, id ?? `${serviceType}:${networkOrBiller}:${planCode}:${providerKey}`, JSON.stringify(body)],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.error

    const { id, isActive } = await req.json()
    if (!id || isActive === undefined) {
      return NextResponse.json({ error: "id and isActive are required" }, { status: 400 })
    }

    await setPlanMappingActive(id, isActive)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.error

    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

    await deletePlanMapping(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 })
  }
}
