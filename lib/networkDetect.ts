// lib/networkDetect.ts
// Detects which Nigerian mobile network a phone number belongs to,
// based on its prefix. Used to warn a user when the number they've
// typed doesn't match the network they've selected (e.g. selecting
// "Glo" but entering an MTN number), before they pay for the wrong
// network's airtime/data.
//
// Prefix lists are maintained by NCC and change occasionally as
// operators get new number ranges allocated — if a legitimate
// number gets flagged as "wrong network", check for new prefixes
// here first before assuming it's a real mismatch.

export type NetworkName = "MTN" | "Airtel" | "Glo" | "9mobile"

const NETWORK_PREFIXES: Record<NetworkName, string[]> = {
  MTN: [
    "0803", "0806", "0703", "0706", "0813", "0814", "0816",
    "0903", "0906", "0913", "0916", "0704", "0707", "0810",
  ],
  Airtel: [
    "0802", "0808", "0708", "0812", "0902", "0901", "0904",
    "0907", "0912",
  ],
  Glo: [
    "0805", "0807", "0705", "0815", "0811", "0905", "0915",
  ],
  "9mobile": [
    "0809", "0818", "0817", "0909", "0908",
  ],
}

/**
 * Strips spaces/dashes/+ and normalizes to a local 0-prefixed number.
 * Handles three shapes people actually paste:
 *  - "+2348031234567" / "2348031234567" → "08031234567"
 *  - "08031234567" → unchanged
 *  - "8031234567" (10 digits, leading 0 dropped — common when a
 *    number is copied from a contacts app or re-typed from the
 *    international format without re-adding the 0) → "08031234567"
 * Anything else is returned with non-digits stripped but otherwise
 * untouched, and isValidNgPhone will reject it as not a recognized
 * shape rather than silently guessing.
 */
export function normalizeNgPhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "")
  if (digits.startsWith("234")) digits = "0" + digits.slice(3)
  else if (digits.length === 10 && /^[789]/.test(digits)) digits = "0" + digits
  return digits
}

/**
 * Basic structural validation for a Nigerian mobile number: exactly 11
 * digits, starting with 070/080/090 (the three ranges NCC allocates
 * mobile prefixes under — see NETWORK_PREFIXES above, which are all
 * 070x/080x/090x). Does NOT check the number is a real, reachable
 * line — only that it's shaped like one. Expects an already-normalized
 * number (run normalizeNgPhone first if the input may have +234/234
 * or formatting characters).
 */
export function isValidNgPhone(normalized: string): boolean {
  return /^0(70|80|90)\d{8}$/.test(normalized)
}

/**
 * Returns the detected network for a Nigerian phone number, or null if
 * the number is too short or doesn't match any known prefix.
 */
export function detectNetwork(rawPhone: string): NetworkName | null {
  const phone = normalizeNgPhone(rawPhone)
  if (phone.length < 4) return null

  const prefix = phone.slice(0, 4)
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES) as [NetworkName, string[]][]) {
    if (prefixes.includes(prefix)) return network
  }
  return null
}

/**
 * Checks whether a phone number matches the selected network.
 * Returns true if the number is too short to judge yet (so we don't
 * show a false warning while the user is still typing), or if it
 * matches, or if the network genuinely can't be determined (some
 * newer/ported numbers can't be detected from prefix alone — we
 * don't want to block those, only warn on a *confident* mismatch).
 */
export function matchesSelectedNetwork(rawPhone: string, selected: NetworkName): boolean {
  const phone = normalizeNgPhone(rawPhone)
  if (phone.length < 11) return true // not a full number yet, don't warn
  const detected = detectNetwork(phone)
  if (!detected) return true // unrecognized prefix — could be ported; don't block
  return detected === selected
}
