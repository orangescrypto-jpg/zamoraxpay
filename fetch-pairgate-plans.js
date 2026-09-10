// fetch-pairgate-plans.js
// Run with: PAIRGATE_API_KEY=your_key node fetch-pairgate-plans.js
//
// Fetches Pairgate's full catalog — data plans (all networks/types),
// cable plans (all providers), electricity discos, and exam pin
// providers — and prints clean tables so you can copy straight into
// the Provider Plan Mappings admin page.
//
// v3: retries on 429 with increasing backoff instead of giving up —
// v2 showed Pairgate's rate limit needs ~4s+ between calls and, once
// tripped, blocks at the Cloudflare level for a stretch. This version
// waits it out and retries rather than losing the request.

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

// Baseline delay between successful calls. Pairgate's own 429 message
// asked for as little as 1s, but the Cloudflare-level block that
// follows repeated hits needs much more room — so this is deliberately
// conservative. The whole run will take several minutes; that's fine,
// it's a one-time catalog pull.
const DELAY_MS = 4000
const MAX_RETRIES = 5

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Returns { ok, data, status, raw }. On a 429, retries with growing
// backoff (10s, 20s, 30s...) up to MAX_RETRIES before giving up on
// that one request — so a transient rate-limit doesn't lose data
// the way it did in v2.
async function getJSON(path, attempt = 1) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // response wasn't JSON at all (e.g. Cloudflare's HTML block page)
    }

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) {
        return { ok: false, status: 429, raw: "gave up after max retries" }
      }
      const backoff = 10000 * attempt // 10s, 20s, 30s, 40s
      console.log(`    (rate limited, waiting ${backoff / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...)`)
      await sleep(backoff)
      return getJSON(path, attempt + 1)
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
