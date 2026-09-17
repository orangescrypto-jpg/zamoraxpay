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
    // TEMPORARY DEBUG — remove after confirming the mismatch.
    // Shows lengths only, never the actual secret values, so this is
    // safe to leave in a response body briefly but should still be
    // deleted once the real cause is found.
    return NextResponse.json(
      {
        error: "Unauthorized",
        debug: {
          receivedHeaderPresent: !!authHeader,
          receivedHeaderLength: authHeader?.length ?? 0,
          expectedSecretPresent: !!expectedSecret,
          expectedSecretLength: expectedSecret?.length ?? 0,
          receivedStartsWithBearer: authHeader?.startsWith("Bearer ") ?? false,
        },
      },
      { status: 401 },
    )
  }

  return null
}
