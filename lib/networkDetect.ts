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
    "0903", "0906", "0913", "0916", "0704",
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

/** Strips spaces/dashes and normalizes a leading +234/234 to a local 0-prefixed number. */
export function normalizeNgPhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "")
  if (digits.startsWith("234")) digits = "0" + digits.slice(3)
  return digits
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
