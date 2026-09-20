// src/services/pinGuard.ts
// Brute-force protection for the 4-digit transaction PIN.
//
// A 4-digit PIN has only 10,000 possibilities. With no attempt limit, an
// attacker holding a stolen session can try them all in minutes. This
// module enforces: MAX_FAILED_ATTEMPTS wrong guesses -> locked for
// LOCKOUT_MINUTES, per user, across every place a PIN is checked.
//
// WHY THE COUNTING IS ATOMIC
// D1 has no cross-statement transactions (see lib/d1.ts), so the obvious
//   read count -> if under limit, verify -> write count+1
// is racy: an attacker fires 500 guesses in parallel, they all read
// "0 failures" and all get checked. Instead we RESERVE an attempt BEFORE
// verifying, using a single statement that both checks the limit and
// increments the counter:
//
//   UPDATE ... SET failed_attempts = failed_attempts + 1
//   WHERE user_id = ? AND (locked_until IS NULL OR locked_until <= now)
//     AND failed_attempts < MAX
//   RETURNING failed_attempts
//
// A row back means "you were allowed this attempt and it is now counted".
// No row means "locked out". Because reservation happens before the
// (expensive) PIN check, parallel guesses each burn a distinct attempt
// and the (MAX+1)th is refused no matter how they interleave. A correct
// PIN then refunds the reserved attempt by resetting the counter.
//
// Fail-CLOSED: if the guard's own DB call errors, the PIN check is
// refused. An outage in the limiter must not silently disable the limit.

import { d1Query } from "@/lib/d1"
import { verifyPin } from "@/src/services/pin"

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MINUTES = 30

export interface PinCheckResult {
  ok: boolean
  /** True when the PIN was correct. False for wrong PIN OR locked out. */
  valid: boolean
  locked: boolean
  attemptsRemaining: number
  /** User-safe message. Never reveals whether an account exists. */
  message: string
}

/**
 * Reserves one PIN attempt. Returns the attempt number just consumed, or
 * null if the user is currently locked out. Atomic — see file header.
 */
async function reserveAttempt(userId: string, nativeDB?: any): Promise<number | null> {
  // Make sure a row exists. INSERT OR IGNORE: user_id is the primary key,
  // so concurrent first-time requests can't create duplicates.
  await d1Query("INSERT OR IGNORE INTO pin_attempts (user_id, failed_attempts) VALUES (?, 0)", [userId], nativeDB)

  // Expire an elapsed lock so the user gets a fresh window. Guarded on
  // locked_until being in the past, so it cannot unlock an active lock.
  await d1Query(
    `UPDATE pin_attempts
        SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE user_id = ? AND locked_until IS NOT NULL AND locked_until <= datetime('now')`,
    [userId],
    nativeDB,
  )

  const reserved = await d1Query(
    `UPDATE pin_attempts
        SET failed_attempts = failed_attempts + 1,
            last_attempt_at = datetime('now'),
            updated_at = datetime('now'),
            locked_until = CASE
              WHEN failed_attempts + 1 >= ? THEN datetime('now', ?)
              ELSE locked_until
            END
      WHERE user_id = ?
        AND locked_until IS NULL
        AND failed_attempts < ?
      RETURNING failed_attempts`,
    [MAX_FAILED_ATTEMPTS, `+${LOCKOUT_MINUTES} minutes`, userId, MAX_FAILED_ATTEMPTS],
    nativeDB,
  )

  const row = reserved.results?.[0]
  return row ? (row.failed_attempts as number) : null
}

async function clearAttempts(userId: string, nativeDB?: any): Promise<void> {
  await d1Query(
    "UPDATE pin_attempts SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE user_id = ?",
    [userId],
    nativeDB,
  )
}

/** Minutes left on an active lock, rounded up. 0 if not locked. */
async function minutesLocked(userId: string, nativeDB?: any): Promise<number> {
  const r = await d1Query(
    `SELECT CAST((julianday(locked_until) - julianday('now')) * 24 * 60 AS INTEGER) + 1 AS mins
       FROM pin_attempts
      WHERE user_id = ? AND locked_until IS NOT NULL AND locked_until > datetime('now')`,
    [userId],
    nativeDB,
  )
  const mins = r.results?.[0]?.mins
  return typeof mins === "number" && mins > 0 ? mins : 0
}

/**
 * The single entry point every PIN check should use.
 *
 * Checks the lockout, reserves an attempt, verifies the PIN, and clears
 * the counter on success. Replaces bare verifyPin() at each call site.
 */
export async function checkPinWithLimit(
  userId: string,
  pin: string,
  storedHash: string,
  nativeDB?: any,
): Promise<PinCheckResult> {
  let attemptNumber: number | null
  try {
    attemptNumber = await reserveAttempt(userId, nativeDB)
  } catch (err) {
    // FAIL CLOSED. If we cannot count attempts we must not allow
    // unlimited guessing, so refuse rather than skip the limiter.
    console.error("[pinGuard] limiter unavailable, refusing PIN check:", err)
    return {
      ok: false,
      valid: false,
      locked: false,
      attemptsRemaining: 0,
      message: "Could not verify your PIN right now. Please try again shortly.",
    }
  }

  if (attemptNumber === null) {
    const mins = await minutesLocked(userId, nativeDB).catch(() => LOCKOUT_MINUTES)
    return {
      ok: false,
      valid: false,
      locked: true,
      attemptsRemaining: 0,
      message: `Too many incorrect PIN attempts. Try again in ${mins || LOCKOUT_MINUTES} minute${(mins || LOCKOUT_MINUTES) === 1 ? "" : "s"}.`,
    }
  }

  if (verifyPin(pin, storedHash)) {
    // Correct: the reserved attempt was not a failure. Reset the counter.
    await clearAttempts(userId, nativeDB).catch((err) =>
      console.error("[pinGuard] failed to clear attempts after success:", err),
    )
    return { ok: true, valid: true, locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS, message: "PIN verified" }
  }

  // Wrong PIN. The attempt was already counted at reservation time.
  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attemptNumber)
  if (remaining === 0) {
    return {
      ok: false,
      valid: false,
      locked: true,
      attemptsRemaining: 0,
      message: `Too many incorrect PIN attempts. Your PIN is locked for ${LOCKOUT_MINUTES} minutes.`,
    }
  }
  return {
    ok: false,
    valid: false,
    locked: false,
    attemptsRemaining: remaining,
    message: `Incorrect transaction PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
  }
}

/** Admin/support tool: clear a user's lockout (e.g. after identity check). */
export async function resetPinAttempts(userId: string, nativeDB?: any): Promise<void> {
  await clearAttempts(userId, nativeDB)
}
