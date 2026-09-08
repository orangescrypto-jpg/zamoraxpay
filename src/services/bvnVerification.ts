// src/services/bvnVerification.ts
// Service abstraction layer — BVN verification for reseller upgrades.
//
// Ships as a STUB by default (per your instruction: "when I see
// traffic I will just add" a real provider). The abstraction is built
// the same way as VTU/payment providers so switching from the stub to
// a real KYC/BVN API later is a one-file change — nothing in the
// reseller-upgrade route needs to change.
//
// IMPORTANT: never store a raw BVN. Only a masked reference is
// persisted (see reseller_bvn_verifications.bvn_masked).

import { d1Query } from "@/lib/d1"
import { randomUUID } from "crypto"

export interface BvnVerificationResult {
  success: boolean
  message: string
}

function maskBvn(bvn: string): string {
  if (bvn.length < 4) return "****"
  return `***_****_${bvn.slice(-4)}`
}

async function verifyViaStub(bvn: string): Promise<BvnVerificationResult> {
  // Stub: accepts any well-formed 11-digit BVN as "verified" so the
  // reseller-upgrade flow is fully testable end-to-end before a real
  // provider is wired in. Replace the body of this function (or add a
  // new case in verifyBvn below) once BVN_VERIFICATION_PROVIDER is set
  // to a real vendor.
  if (!/^\d{11}$/.test(bvn)) {
    return { success: false, message: "BVN must be exactly 11 digits" }
  }
  return { success: true, message: "BVN verified (stub mode — no real provider configured yet)" }
}

/**
 * Dispatches to whichever BVN provider is configured. Admin sets
 * BVN_VERIFICATION_PROVIDER via env or the admin panel; defaults to
 * the stub. Add a new `case` + implementation function to support a
 * real vendor (e.g. Paystack Identity, Youverify, Smile Identity, etc.)
 * without touching the reseller-upgrade route.
 */
export async function verifyBvn(userId: string, bvn: string, nativeDB?: any): Promise<BvnVerificationResult> {
  const provider = process.env.BVN_VERIFICATION_PROVIDER || "stub"

  let result: BvnVerificationResult
  switch (provider) {
    case "stub":
    default:
      result = await verifyViaStub(bvn)
  }

  await d1Query(
    `INSERT INTO reseller_bvn_verifications (id, user_id, bvn_masked, provider_used, status, verified_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       bvn_masked = excluded.bvn_masked, provider_used = excluded.provider_used,
       status = excluded.status, verified_at = excluded.verified_at`,
    [
      randomUUID(),
      userId,
      maskBvn(bvn),
      provider,
      result.success ? "verified" : "failed",
      result.success ? new Date().toISOString() : null,
    ],
    nativeDB,
  )

  return result
}
