// src/services/planLabel.ts
// Service abstraction layer — turns a "<size>mb-<days>d..." plan_code into a
// human-friendly label like "1GB - 30 days" or "200MB - 1 day (Social + Binge)".
// Mirrors the parser used on the buy-data page (app/(dashboard)/services/data/page.tsx)
// so plan codes read the same way everywhere they're shown to a human — including the
// admin Spin & Win prize form, where raw plan codes were otherwise shown unparsed.

const CATEGORY_KEYS = new Set(["gifting", "awoof", "cg", "cg_lite", "sme", "corporate", "direct", "standard"])

const BUNDLE_TAG_LABELS: Record<string, string> = {
  social: "Social",
  binge: "Binge",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  video: "Video",
}

const KNOWN_BUNDLE_TAGS = new Set(Object.keys(BUNDLE_TAG_LABELS))

/** "1000mb-30d" -> "1GB", "500mb-7d" -> "500MB", "2500mb-30d" -> "2.5GB". */
function sizeLabelFromMB(sizeMB: number): string {
  if (sizeMB >= 1000 && sizeMB % 1000 === 0) return `${sizeMB / 1000}GB`
  if (sizeMB >= 1000) return `${(sizeMB / 1000).toFixed(1)}GB`
  return `${sizeMB}MB`
}

/**
 * "1000mb-30d-gifting" -> "1GB - 30 days"
 * "500mb-7d-social+binge" -> "500MB - 7 days (Social + Binge)"
 * Falls back to the raw code unchanged when it doesn't match the
 * "<size>mb-<days>d..." shape (named plan families, cable, exam_pin, etc.).
 */
export function labelFromPlanCode(code: string): string {
  const match = code.match(/^(\d+)mb-(\d+)d((?:-[a-z_+]+)*)$/i)
  if (!match) return code
  const [, sizeMBStr, daysStr, suffixPart] = match
  const sizeMB = parseInt(sizeMBStr, 10)
  const days = parseInt(daysStr, 10)
  const sizeLabel = sizeLabelFromMB(sizeMB)
  const dayLabel = days === 1 ? "1 day" : `${days} days`

  const segments = suffixPart ? suffixPart.split("-").filter(Boolean) : []
  const bundleParts = segments.filter((s) => s.includes("+") || (KNOWN_BUNDLE_TAGS.has(s) && !CATEGORY_KEYS.has(s)))
  const bundleLabel = bundleParts.length
    ? " (" +
      bundleParts
        .flatMap((s) => s.split("+"))
        .map((t) => BUNDLE_TAG_LABELS[t] ?? t)
        .join(" + ") +
      ")"
    : ""

  return `${sizeLabel} - ${dayLabel}${bundleLabel}`
}
