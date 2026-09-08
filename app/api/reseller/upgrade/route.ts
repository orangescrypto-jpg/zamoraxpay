// app/api/reseller/upgrade/route.ts
// Upgrades a retail user to reseller tier by charging the flat upgrade
// fee from their wallet. BVN verification is optional and separate
// (see /api/reseller/bvn-verify) — it unlocks higher wholesale limits
// but is not required to become a reseller at the base tier.

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth-server"
import { d1Query } from "@/lib/db"
import { debitWallet } from "@/src/services/wallet"
import { isFeatureEnabled } from "@/src/services/config"

const RESELLER_UPGRADE_FEE_KOBO = 300_000 // ₦3,000 default — admin-editable via pricing rules in a later iteration

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.error

  if (!(await isFeatureEnabled("reseller_upgrade"))) {
    return NextResponse.json({ error: "Reseller upgrades are currently unavailable" }, { status: 503 })
  }

  try {
    const userResult = await d1Query("SELECT tier FROM users WHERE id = ?", [auth.uid])
    const user = userResult.results?.[0]
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (user.tier === "reseller") {
      return NextResponse.json({ error: "Account is already on the reseller tier" }, { status: 400 })
    }

    const debit = await debitWallet({
      userId: auth.uid,
      amountKobo: RESELLER_UPGRADE_FEE_KOBO,
      type: "reseller_upgrade",
      reference: `ZPRSU-${randomUUID()}`,
    })

    if (!debit.success) {
      return NextResponse.json({ error: debit.message ?? "Insufficient wallet balance for upgrade fee" }, { status: 400 })
    }

    await d1Query("UPDATE users SET tier = 'reseller', updated_at = datetime('now') WHERE id = ?", [auth.uid])

    return NextResponse.json({
      success: true,
      message: "Account upgraded to reseller tier. Wholesale pricing is now active.",
      newBalanceKobo: debit.newBalanceKobo,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upgrade failed" }, { status: 500 })
  }
}
