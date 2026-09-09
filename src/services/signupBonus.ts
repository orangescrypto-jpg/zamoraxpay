// src/services/signupBonus.ts
// Service abstraction layer — signup bonus awarding.
//
// Bonus amount is fully admin-controlled via site_settings
// (signup_bonus_amount_kobo) and gated by the 'signup_bonus' feature
// flag — never hardcoded. Credited once, right after a new user's
// wallet is created, so it's usable immediately like any other wallet
// funds (buy airtime, data, electricity, etc.).
//
// Idempotency comes from creditWallet's own reference-uniqueness
// check (keyed on the user id), so calling this twice for the same
// user is always a safe no-op — it will never double-credit.

import { creditWallet } from "@/src/services/wallet"
import { getSettingNumber } from "@/src/services/siteSettings"
import { isFeatureEnabled } from "@/src/services/config"

export interface SignupBonusResult {
  awarded: boolean
  amountKobo: number
  reason?: string
}

/**
 * Call this right after a new user's wallet row is created during
 * signup. Safe to call even if the flag is off or the amount is 0 —
 * it will simply report awarded: false and skip crediting.
 */
export async function awardSignupBonus(userId: string, nativeDB?: any): Promise<SignupBonusResult> {
  if (!(await isFeatureEnabled("signup_bonus", nativeDB))) {
    return { awarded: false, amountKobo: 0, reason: "Signup bonus is currently disabled" }
  }

  const amountKobo = await getSettingNumber("signup_bonus_amount_kobo", 0, nativeDB)
  if (amountKobo <= 0) {
    return { awarded: false, amountKobo: 0, reason: "Signup bonus amount is not configured" }
  }

  await creditWallet(
    {
      userId,
      amountKobo,
      type: "signup_bonus",
      reference: `ZPSB-${userId}`,
      metadata: { reason: "signup_bonus" },
    },
    nativeDB,
  )

  return { awarded: true, amountKobo }
}
