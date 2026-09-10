// fetch-pairgate-plans.js
// Run with: PAIRGATE_API_KEY=your_key node fetch-pairgate-plans.js
//
// Fetches Pairgate's full catalog — data plans (all networks/types),
// cable plans (all providers), electricity discos, and exam pin
// providers — and prints clean tables so you can copy straight into
// the Provider Plan Mappings admin page.

const API_KEY = process.env.PAIRGATE_API_KEY
if (!API_KEY) {
  console.error("Set PAIRGATE_API_KEY as an env var first, e.g.:")
  console.error("  PAIRGATE_API_KEY=your_key node fetch-pairgate-plans.js")
  process.exit(1)
}

// Use the /test prefix while you're just browsing plan IDs — costs
// nothing and doesn't touch your real balance.
const USE_TEST_MODE = true
const BASE = USE_TEST_MODE ? "https://pairgate.com/api/v1/test" : "https://pairgate.com/api/v1"

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Cache-Control": "no-cache",
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS })
  const json = await res.json().catch(() => null)
  if (!json || json.status !== "success") return null
  return json.data
}

function printPlanTable(heading, plans) {
  if (!plans || plans.length === 0) return
  console.log(`\n=== ${heading} ===`)
  console.log("plan_id".padEnd(10) + "price".padEnd(12) + "duration".padEnd(10) + "name")
  for (const p of plans) {
    console.log(
      String(p.plan_id).padEnd(10) +
        `₦${p.price}`.padEnd(12) +
        `${p.duration ?? "-"}d`.padEnd(10) +
        p.name,
    )
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchDataPlans() {
  const PROVIDERS = ["mtn", "airtel", "glo", "9mobile"]
  const PLAN_TYPES = ["SME", "CG", "CG_LITE", "GIFTING", "AWOOF"]

  console.log("\n\n########## DATA PLANS ##########")
  for (const provider of PROVIDERS) {
    for (const planType of PLAN_TYPES) {
      const data = await getJSON(`/data-plans?provider_id=${provider}&plan_type=${planType}`)
      if (!data) continue
      for (const [networkName, plans] of Object.entries(data)) {
        printPlanTable(`${networkName} — ${planType}`, plans)
      }
      await sleep(250)
    }
  }
}

async function fetchCablePlans() {
  const PROVIDERS = ["dstv", "gotv", "startimes", "showmax"]

  console.log("\n\n########## CABLE PLANS ##########")
  for (const provider of PROVIDERS) {
    const data = await getJSON(`/cable-plans?provider_id=${provider}`)
    if (!data) continue
    for (const [name, plans] of Object.entries(data)) {
      printPlanTable(name, plans)
    }
    await sleep(250)
  }
}

async function fetchProvidersByType(type, heading) {
  console.log(`\n\n########## ${heading} ##########`)
  const data = await getJSON(`/providers/${type}`)
  if (!data) {
    console.log("(no data returned — check that this service type is supported on your account)")
    return
  }
  console.log(JSON.stringify(data, null, 2))
}

async function main() {
  await fetchDataPlans()
  await fetchCablePlans()
  // Electricity is amount-based (no fixed plans) — you only need the
  // disco IDs (ikedc, aedc, ekedc, etc.), fetched here.
  await fetchProvidersByType("electricity", "ELECTRICITY PROVIDERS (discos)")
  // Exam pins — Pairgate calls this service type "education" in their
  // provider listing (covers WAEC/JAMB).
  await fetchProvidersByType("education", "EXAM PIN PROVIDERS")
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
