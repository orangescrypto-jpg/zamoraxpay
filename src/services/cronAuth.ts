// src/services/cronAuth.ts
// Shared auth check for every /api/cron/* route. Secret is checked
// against D1 (admin-rotatable via Settings > Cron Secret) first, then
// falls back to the CRON_SECRET env var for deployments that haven't
// set one in D1 yet. Unlike the old per-route checks, a completely
// unset secret now REJECTS the request instead of allowing it through —
// an unconfigured secret is not an open endpoint.
import { NextRequest, NextResponse } from "next/server"
import { getCronSecret } from "@/src/services/siteSettings"

export async function verifyCronAuth(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get("authorization")
  const expectedSecret = (await getCronSecret()) || process.env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
