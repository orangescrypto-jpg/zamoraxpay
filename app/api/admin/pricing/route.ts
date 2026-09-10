// app/api/admin/pricing/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { listPricingRules, upsertPricingRule, deletePricingRule } from "@/src/services/pricing"
import type { VtuServiceType } from "@/src/types"

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType") as VtuServiceType | null
  const rules = await listPricingRules(serviceType ?? undefined)
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    const body = await req.json()
    const { id, serviceType, networkOrBiller, planCode, retailPriceKobo, wholesalePriceKobo, convenienceFeeKobo } = body

    if (!serviceType || !networkOrBiller || retailPriceKobo == null || wholesalePriceKobo == null) {
      return NextResponse.json(
        { error: "serviceType, networkOrBiller, retailPriceKobo, and wholesalePriceKobo are required" },
        { status: 400 },
      )
    }

    await upsertPricingRule(
      {
        id,
        serviceType,
        networkOrBiller,
        planCode: planCode ?? null,
        retailPriceKobo,
        wholesalePriceKobo,
        convenienceFeeKobo: convenienceFeeKobo ?? 0,
      },
      auth.uid,
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.error

  try {
    // Bulk delete: POST-style body with an array of ids. Falls back to
    // the original single-id query-param delete when no body is sent.
    const contentLength = req.headers.get("content-length")
    if (contentLength && contentLength !== "0") {
      const body = await req.json().catch(() => null)
      if (body?.ids && Array.isArray(body.ids) && body.ids.length > 0) {
        for (const id of body.ids) {
          await deletePricingRule(id)
        }
        return NextResponse.json({ success: true, deletedCount: body.ids.length })
      }
    }

    const id = req.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    await deletePricingRule(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 })
  }
}
