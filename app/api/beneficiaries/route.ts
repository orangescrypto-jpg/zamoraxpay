// app/api/beneficiaries/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const serviceType = req.nextUrl.searchParams.get("serviceType")
  const sql = serviceType
    ? "SELECT * FROM beneficiaries WHERE user_id = ? AND service_type = ? ORDER BY created_at DESC"
    : "SELECT * FROM beneficiaries WHERE user_id = ? ORDER BY created_at DESC"
  const params = serviceType ? [auth.uid, serviceType] : [auth.uid]
  const result = await d1Query(sql, params)
  return NextResponse.json({ beneficiaries: result.results ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  try {
    const { serviceType, networkOrBiller, recipient, nickname } = await req.json()
    if (!serviceType || !networkOrBiller || !recipient) {
      return NextResponse.json({ error: "serviceType, networkOrBiller, and recipient are required" }, { status: 400 })
    }

    const id = randomUUID()
    await d1Query(
      "INSERT INTO beneficiaries (id, user_id, service_type, network_or_biller, recipient, nickname) VALUES (?, ?, ?, ?, ?, ?)",
      [id, auth.uid, serviceType, networkOrBiller, recipient, nickname ?? null],
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save beneficiary" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 })

  await d1Query("DELETE FROM beneficiaries WHERE id = ? AND user_id = ?", [id, auth.uid])
  return NextResponse.json({ success: true })
}
