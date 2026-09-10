// fetch-vtpass-plans.mjs
//
// One-off script — NOT part of the app codebase, just a helper to
// pull VTpass's live plan list + their cost per plan, so you can
// copy real variation_code / variation_amount values into your
// admin "Plan Mappings" and "Pricing" screens.
//
// Usage:
//   VTPASS_API_KEY=xxx VTPASS_SECRET_KEY=xxx VTPASS_BASE_URL=https://sandbox.vtpass.com/api \
//     node fetch-vtpass-plans.mjs
//
// Prints one JSON block per serviceID with each plan's:
//   variation_code   -> paste into provider_plan_mappings.provider_plan_id
//   variation_amount -> paste into provider_plan_mappings.provider_cost_kobo (x100 for kobo)
//   name             -> paste into provider_plan_mappings.provider_plan_label

const BASE_URL = process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api"
const API_KEY = process.env.VTPASS_API_KEY
const SECRET_KEY = process.env.VTPASS_SECRET_KEY
const PUBLIC_KEY = process.env.VTPASS_PUBLIC_KEY // GET requests use public-key, not secret-key

// Add/remove serviceIDs here as needed. These are VTpass's own
// serviceID strings (confirm exact spelling against your VTpass
// dashboard's "Products" list if any of these come back empty).
const SERVICE_IDS = [
  "mtn-data",
  "glo-data",
  "airtel-data",
  "etisalat-data", // 9mobile
  "dstv",
  "gotv",
  "startimes",
  "ikeja-electric",
  "eko-electric",
  "waec",
  "jamb",
]

async function fetchVariations(serviceID) {
  const url = `${BASE_URL}/service-variations?serviceID=${encodeURIComponent(serviceID)}`
  const res = await fetch(url, {
    headers: {
      "api-key": API_KEY,
      "public-key": PUBLIC_KEY || SECRET_KEY, // some VTpass envs accept secret-key here too
    },
  })
  const json = await res.json()
  return json
}

async function main() {
  if (!API_KEY) {
    console.error("Missing VTPASS_API_KEY env var.")
    process.exit(1)
  }

  for (const serviceID of SERVICE_IDS) {
    console.log(`\n=== ${serviceID} ===`)
    try {
      const json = await fetchVariations(serviceID)
      const variations = json?.content?.varations ?? json?.content?.variations ?? []
      if (!Array.isArray(variations) || variations.length === 0) {
        console.log("  (no variations returned — check serviceID spelling, or this service has no plans, e.g. airtime)")
        console.log("  raw:", JSON.stringify(json).slice(0, 300))
        continue
      }
      for (const v of variations) {
        console.log(
          `  code=${v.variation_code}  amount=${v.variation_amount}  name="${v.name}"`,
        )
      }
    } catch (err) {
      console.log("  error:", err.message)
    }
    // Small delay to be polite to their API / avoid rate limits.
    await new Promise((r) => setTimeout(r, 400))
  }
}

main()
