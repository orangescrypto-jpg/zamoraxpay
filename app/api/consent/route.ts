// app/api/consent/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { d1Query } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const { anonymousId, choice, categories } = await req.json()
    if (!anonymousId || !choice) {
      return NextResponse.json({ error: "anonymousId and choice are required" }, { status: 400 })
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

    await d1Query(
      "INSERT INTO cookie_consents (id, anonymous_id, choice, categories_json, ip_address) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), anonymousId, choice, categories ? JSON.stringify(categories) : null, ip],
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to record consent" }, { status: 500 })
  }
}
