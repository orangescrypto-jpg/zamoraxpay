// src/services/pin.ts
// Shared PIN hash/verify helpers so the set-PIN and verify-PIN routes
// don't duplicate the crypto logic (and can't drift out of sync).

import { scryptSync, randomBytes, timingSafeEqual } from "crypto"

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(pin, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":")
  if (!salt || !hash) return false
  const computed = scryptSync(pin, salt, 64)
  const stored = Buffer.from(hash, "hex")
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}
