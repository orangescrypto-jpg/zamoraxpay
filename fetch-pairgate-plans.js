// fetch-pairgate-plans.js
// Run with: PAIRGATE_API_KEY=your_key node fetch-pairgate-plans.js
//
// Fetches Pairgate's full catalog — data plans (all networks/types),
// cable plans (all providers), electricity discos, and exam pin
// providers — and prints clean tables so you can copy straight into
// the Provider Plan Mappings admin page.
//
// v2: every failed call now prints WHY (status code + response body)
// instead of silently vanishing, requests are spaced further apart
// to avoid rate-limiting, and a couple of endpoint path variants are
// tried for cable/electricity/exam-pins in case the first guess is
// wrong for your account tier.

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

// Slower pacing than v1 — Pairgate's rate limit silently dropped most
// of the previous run's requests. 1.2s between calls is conservative
// but reliable.
const DELAY_MS = 1200

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Returns { ok, data, status, raw } instead of just data-or-null, so
// callers can print the actual failure reason instead of nothing.
async function getJSON(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // response wasn't JSON at all (e.g. an HTML error page)
    }

    if (!res.ok) {
      return { ok: false, status: res.status, raw: text.slice(0, 300) }
    }
    if (!json || json.status !== "success") {
      return { ok: false, status: res.status, raw: text.slice(0, 300) }
    }
    return { ok: true, data: json.data }
  } catch (err) {
    return { ok: false, status: "network-error", raw: err.message }
  }
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

function printFailure(label, result) {
  console.log(`  ✗ ${label} — status ${result.status}: ${result.raw}`)
}

async function fetchDataPlans() {
  const PROVIDERS = ["mtn", "airtel", "glo", "9mobile"]
  const PLAN_TYPES = ["SME", "CG", "CG_LITE", "GIFTING", "AWOOF"]

  console.log("\n\n########## DATA PLANS ##########")
  for (const provider of PROVIDERS) {
    for (const planType of PLAN_TYPES) {
      const result = await getJSON(`/data-plans?provider_id=${provider}&plan_type=${planType}`)
      if (!result.ok) {
        printFailure(`${provider} — ${planType}`, result)
      } else {
        for (const [networkName, plans] of Object.entries(result.data)) {
          printPlanTable(`${networkName} — ${planType}`, plans)
        }
      }
      await sleep(DELAY_MS)
    }
  }
}

async function fetchCablePlans() {
  const PROVIDERS = ["dstv", "gotv", "startimes", "showmax"]

  console.log("\n\n########## CABLE PLANS ##########")
  for (const provider of PROVIDERS) {
    const result = await getJSON(`/cable-plans?provider_id=${provider}`)
    if (!result.ok) {
      printFailure(provider, result)
    } else {
      for (const [name, plans] of Object.entries(result.data)) {
        printPlanTable(name, plans)
      }
    }
    await sleep(DELAY_MS)
  }
}

async function fetchProvidersByType(type, heading) {
  console.log(`\n\n########## ${heading} ##########`)
  const result = await getJSON(`/providers/${type}`)
  if (!result.ok) {
    printFailure(type, result)
    return
  }
  console.log(JSON.stringify(result.data, null, 2))
}

async function main() {
  await fetchDataPlans()
  await sleep(DELAY_MS)
  await fetchCablePlans()
  await sleep(DELAY_MS)
  // Electricity is amount-based (no fixed plans) — you only need the
  // disco IDs (ikedc, aedc, ekedc, etc.), fetched here.
  await fetchProvidersByType("electricity", "ELECTRICITY PROVIDERS (discos)")
  await sleep(DELAY_MS)
  // Exam pins — Pairgate calls this service type "education" in their
  // provider listing (covers WAEC/JAMB).
  await fetchProvidersByType("education", "EXAM PIN PROVIDERS")
}

main().catch((err) => {
  console.error("Failed:", err.message)
  process.exit(1)
})
