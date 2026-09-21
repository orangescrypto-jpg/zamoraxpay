// src/services/streakProtection.ts
// Service abstraction layer — streak shields won from the spin.
// One shield forgives one missed day on the daily check-in streak.
// Consuming is a single guarded UPDATE, so two simultaneous check-ins can
// never spend the same shield twice.

import { d1Query } from "@/lib/d1"

export async function getProtectionTokens(userId: string, nativeDB?: any): Promise<number> {
  try {
    const result = await d1Query("SELECT tokens FROM streak_protections WHERE user_id = ?", [userId], nativeDB)
    return result.results?.[0]?.tokens ?? 0
  } catch {
    return 0
  }
}

export async function addProtectionTokens(userId: string, count: number, nativeDB?: any): Promise<void> {
  if (!Number.isInteger(count) || count <= 0) return
  await d1Query(
    `INSERT INTO streak_protections (user_id, tokens) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET tokens = tokens + excluded.tokens, updated_at = datetime('now')`,
    [userId, count],
    nativeDB,
  )
}

/** Spends `count` shields atomically. Returns false (and spends nothing) if the user doesn't have enough. */
export async function consumeProtectionTokens(userId: string, count: number, nativeDB?: any): Promise<boolean> {
  if (!Number.isInteger(count) || count <= 0) return false
  try {
    const result = await d1Query(
      `UPDATE streak_protections SET tokens = tokens - ?, updated_at = datetime('now')
        WHERE user_id = ? AND tokens >= ?
        RETURNING tokens`,
      [count, userId, count],
      nativeDB,
    )
    return (result.results?.length ?? 0) > 0
  } catch {
    return false
  }
}
