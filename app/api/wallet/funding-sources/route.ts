// app/api/wallet/funding-sources/route.ts
// Lets the frontend show the user which bank accounts they're
// eligible to withdraw to — i.e. accounts they've actually funded
// their wallet from before. This is informational for the withdrawal
// form UI; the real enforcement happens server-side in
// requestWithdrawal().

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-server"
import { getUserFundingSources } from "@/src/services/fundingSource"

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  const sources = await getUserFundingSources(auth.uid)
  return NextResponse.json({ sources })
}
