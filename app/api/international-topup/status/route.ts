// app/api/international-topup/status/route.ts
// Paginated history of the caller's own international top-up orders —
// same shape/spirit as the regular VTU orders history endpoint.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/d1"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 50)

  const result = await d1Query(
    `SELECT id, provider_key, operator_id, operator_name, country_code, recipient_number,
            requested_amount, requested_amount_currency, delivered_amount, delivered_amount_currency,
            charged_amount_kobo, status, provider_reference, created_at
     FROM international_topup_orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [auth.uid, limit],
  )

  return NextResponse.json({ success: true, data: result.results ?? [] })
}
