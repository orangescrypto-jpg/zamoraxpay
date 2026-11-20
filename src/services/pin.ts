// src/services/pin.ts
// Shared PIN hash/verify helpers so the set-PIN and verify-PIN routes
// don't duplicate the crypto logic (and can't drift out of sync).
//
// CPU COST ON CLOUDFLARE WORKERS
// scrypt's cost is dominated by N: each call allocates ~128*N*r bytes and
// burns proportional CPU. Node's implicit defaults (N=16384, r=8) work out
// to roughly 50-100ms of pure CPU per hash/verify — on Workers that is
// enough to trip "exceededCpu" (Error 1102) on any PIN route, and it makes
// every purchase verify noticeably slow even on the Paid plan.
//
// The cost parameters are now stored INSIDE the hash string, so they can be
// tuned later without breaking hashes already in the database:
//
//   legacy: "<saltHex>:<hashHex>"                    (Node defaults)
//   v2:     "scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>"
//
// v2 uses N=4096 (4 MiB of memory, roughly a quarter of the legacy CPU).
// A 4-digit PIN has only 10,000 combinations, so online brute force is
// handled by pinGuard's atomic lockout — not by KDF cost. N=4096 still
// keeps offline guessing from a stolen database far from free.
// checkPinWithLimit() transparently rehashes legacy hashes on the next
// successful verify, so existing users migrate automatically (see
// src/services/pinGuard.ts).

import { scryptSync, randomBytes, timingSafeEqual } from "crypto"

const KEYLEN = 64
const SALT_BYTES = 16

// Sanity bounds for parameters parsed OUT of a stored hash. The column is
// only written by this app, but a corrupt/compromised row must not make
// the Worker allocate gigabytes while verifying.
const MAX_N = 1 << 21
const MAX_R = 64
const MAX_P = 8

interface ScryptParams {
  N: number
  r: number
  p: number
}

// v2 parameters: 4 MiB of scrypt memory instead of the 16 MiB the Node
// defaults need, and ~4x less CPU per call.
const SCRYPT_V2: ScryptParams = { N: 4096, r: 8, p: 1 }

// Computes the scrypt value a stored hash implies for this pin, or null if
// the stored hash is malformed (verify then fails closed).
function computeStored(pin: string, storedHash: string): Buffer | null {
  // Legacy format "<salt>:<hash>" — call scryptSync WITHOUT options so the
  // Node defaults apply exactly as they did when the hash was created.
  if (!storedHash.startsWith("scrypt$")) {
    const [salt, hash] = storedHash.split(":")
    if (!salt || !hash) return null
    return scryptSync(pin, salt, KEYLEN)
  }

  const parts = storedHash.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return null
  const [, nStr, rStr, pStr, salt] = parts
  const N = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null
  if (N < 1 || N > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null
  return scryptSync(pin, salt, KEYLEN, { N, r, p })
}

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex")
  const hash = scryptSync(pin, salt, KEYLEN, SCRYPT_V2).toString("hex")
  return `scrypt$${SCRYPT_V2.N}$${SCRYPT_V2.r}$${SCRYPT_V2.p}$${salt}$${hash}`
}

// True when storedHash predates the stored-params format. Such hashes still
// verify correctly (with the legacy Node defaults), but cost ~4x the CPU of
// a v2 hash — checkPinWithLimit uses this to upgrade after a successful
// verify, and anything else that stores a fresh hash should use hashPin().
export function isLegacyPinHash(storedHash: string): boolean {
  return !storedHash.startsWith("scrypt$")
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const computed = computeStored(pin, storedHash)
  if (!computed) return false

  const hashStart = storedHash.startsWith("scrypt$")
    ? storedHash.lastIndexOf("$") + 1
    : storedHash.indexOf(":") + 1
  const stored = Buffer.from(storedHash.slice(hashStart), "hex")
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}
