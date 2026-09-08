// app/api/reseller/bvn-verify/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { verifyBvn } from "@/src/services/bvnVerification"
import { isFeatureEnabled } from "@/src/services/config"

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  if (!(await isFeatureEnabled("bvn_verification"))) {
    return NextResponse.json({ error: "BVN verification is currently disabled" }, { status: 503 })
  }

  try {
    const { bvn } = await req.json()
    if (!bvn) return NextResponse.json({ error: "BVN is required" }, { status: 400 })

    const result = await verifyBvn(auth.uid, bvn)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "BVN verification failed" }, { status: 500 })
  }
}
