// app/api/admin/pricing/bulk/route.ts
// Bulk CSV upload for pricing rules. Parses the same fields the
// single-row admin form (app/(admin)/admin/pricing/page.tsx) collects,
// and writes each row through the same upsertPricingRule() used
// there — so validation and the insert/update behavior are identical
// whether a rule came from the form or a CSV row.
//
// pricing_rules has no UNIQUE constraint (unlike provider_plan_mappings),
// so this route looks up each row's natural key (service_type +
// network_or_biller + plan_code) itself before writing, to decide
// INSERT vs UPDATE and to tell the admin which one happened — the
// same "detect duplicates and say so" behavior as the plan-mappings
// bulk uploader.
//
// One bad row never blocks the rest of the file: every row is
// attempted independently and the response reports per-row
// created/updated/error so the admin can fix just the rows that failed.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { upsertPricingRule, findPricingRuleByNaturalKey } from "@/src/services/pricing"
import type { VtuServiceType } from "@/src/types"

const VALID_SERVICE_TYPES: VtuServiceType[] = ["airtime", "data", "cable", "electricity", "exam_pin", "betting"]

const REQUIRED_HEADERS = ["service_type", "network_or_biller", "retail_price_naira", "wholesale_price_naira"] as const

interface RowResult {
  row: number
  status: "created" | "updated" | "error"
  message?: string
}

// Minimal CSV line parser — handles quoted fields and escaped quotes
// ("") but not multi-line quoted fields, which this data (single-line
// pricing rows) never needs.
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      fields.push(current)
      current = ""
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.error

    const body = await req.json()
    const csvText: string | undefined = body.csv
    if (!csvText || typeof csvText !== "string") {
      return NextResponse.json({ error: "csv text is required" }, { status: 400 })
    }

    const lines = csvText.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 })
    }

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h))
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required column(s): ${missingHeaders.join(", ")}` },
        { status: 400 },
      )
    }

    const colIndex = (name: string) => header.indexOf(name)
    const results: RowResult[] = []

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1 // 1-based, matches spreadsheet row numbers including header
      const fields = parseCsvLine(lines[i])

      try {
        const serviceType = fields[colIndex("service_type")]?.trim().toLowerCase() as VtuServiceType
        const networkOrBiller = fields[colIndex("network_or_biller")]?.trim()
        const planCodeIndex = colIndex("plan_code")
        const planCodeRaw = planCodeIndex !== -1 ? fields[planCodeIndex]?.trim() : ""
        const planCode = planCodeRaw ? planCodeRaw : null
        const retailPriceNairaRaw = fields[colIndex("retail_price_naira")]?.trim()
        const wholesalePriceNairaRaw = fields[colIndex("wholesale_price_naira")]?.trim()
        const feeIndex = colIndex("convenience_fee_naira")
        const feeRaw = feeIndex !== -1 ? fields[feeIndex]?.trim() : ""

        if (!VALID_SERVICE_TYPES.includes(serviceType)) {
          throw new Error(`Invalid service_type "${serviceType}" (must be one of ${VALID_SERVICE_TYPES.join(", ")})`)
        }
        if (!networkOrBiller || !retailPriceNairaRaw || !wholesalePriceNairaRaw) {
          throw new Error("service_type, network_or_biller, retail_price_naira, and wholesale_price_naira are all required")
        }

        const retailPriceNaira = parseFloat(retailPriceNairaRaw)
        const wholesalePriceNaira = parseFloat(wholesalePriceNairaRaw)
        if (isNaN(retailPriceNaira) || retailPriceNaira < 0) {
          throw new Error(`Invalid retail_price_naira "${retailPriceNairaRaw}"`)
        }
        if (isNaN(wholesalePriceNaira) || wholesalePriceNaira < 0) {
          throw new Error(`Invalid wholesale_price_naira "${wholesalePriceNairaRaw}"`)
        }

        let convenienceFeeNaira = 0
        if (feeRaw) {
          convenienceFeeNaira = parseFloat(feeRaw)
          if (isNaN(convenienceFeeNaira) || convenienceFeeNaira < 0) {
            throw new Error(`Invalid convenience_fee_naira "${feeRaw}"`)
          }
        }

        const retailPriceKobo = Math.round(retailPriceNaira * 100)
        const wholesalePriceKobo = Math.round(wholesalePriceNaira * 100)
        const convenienceFeeKobo = Math.round(convenienceFeeNaira * 100)

        const existing = await findPricingRuleByNaturalKey(serviceType, networkOrBiller, planCode)

        await upsertPricingRule(
          {
            id: existing?.id,
            serviceType,
            networkOrBiller,
            planCode,
            retailPriceKobo,
            wholesalePriceKobo,
            convenienceFeeKobo,
          },
          auth.uid,
        )

        if (existing) {
          const changedFields: string[] = []
          if (existing.retail_price_kobo !== retailPriceKobo) changedFields.push("retail price")
          if (existing.wholesale_price_kobo !== wholesalePriceKobo) changedFields.push("wholesale price")
          if (existing.convenience_fee_kobo !== convenienceFeeKobo) changedFields.push("convenience fee")

          results.push({
            row: rowNum,
            status: "updated",
            message:
              changedFields.length > 0
                ? `Duplicate of an existing rule (${networkOrBiller}${planCode ? " " + planCode : ""}). Updated ${changedFields.join(", ")}.`
                : `Duplicate of an existing rule (${networkOrBiller}${planCode ? " " + planCode : ""}). No changes, values were identical.`,
          })
        } else {
          results.push({ row: rowNum, status: "created" })
        }
      } catch (rowErr) {
        results.push({
          row: rowNum,
          status: "error",
          message: rowErr instanceof Error ? rowErr.message : "Unknown error",
        })
      }
    }

    const createdCount = results.filter((r) => r.status === "created").length
    const updatedCount = results.filter((r) => r.status === "updated").length
    const errorCount = results.filter((r) => r.status === "error").length

    return NextResponse.json({ createdCount, updatedCount, errorCount, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bulk upload failed" }, { status: 500 })
  }
}
