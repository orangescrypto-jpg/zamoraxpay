// app/api/admin/provider-plan-mappings/bulk/route.ts
// Bulk CSV upload for provider plan mappings. Parses the same fields
// the single-row admin form collects, and upserts each row through
// the exact same upsertPlanMapping() used there — so validation, the
// UNIQUE(service_type, network_or_biller, plan_code, provider_key)
// upsert-on-conflict behavior, and the audit log entry all behave
// identically whether a mapping came from the form or a CSV row.
//
// One bad row never blocks the rest of the file: every row is
// attempted independently and the response reports per-row
// success/failure so the admin can fix just the rows that failed.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-server"
import { upsertPlanMapping, findMappingByNaturalKey } from "@/src/services/providerPlanMappings"
import { d1Query } from "@/lib/db"
import { randomUUID } from "crypto"
import type { VtuServiceType } from "@/src/types"

const VALID_SERVICE_TYPES: VtuServiceType[] = ["data", "cable", "exam_pin", "electricity"]

const REQUIRED_HEADERS = [
  "service_type",
  "network_or_biller",
  "plan_code",
  "provider_key",
  "provider_plan_id",
  "provider_cost_naira",
] as const

interface RowResult {
  row: number
  status: "created" | "updated" | "error"
  message?: string
}

// Minimal CSV line parser — handles quoted fields and escaped quotes
// ("") but not multi-line quoted fields, which this data (single-line
// plan mapping rows) never needs.
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
        const planCode = fields[colIndex("plan_code")]?.trim()
        const providerKey = fields[colIndex("provider_key")]?.trim()
        const providerPlanId = fields[colIndex("provider_plan_id")]?.trim()
        const providerCostNairaRaw = fields[colIndex("provider_cost_naira")]?.trim()
        const labelIndex = colIndex("provider_plan_label")
        const providerPlanLabel = labelIndex !== -1 ? fields[labelIndex]?.trim() || undefined : undefined

        if (!VALID_SERVICE_TYPES.includes(serviceType)) {
          throw new Error(`Invalid service_type "${serviceType}" (must be one of ${VALID_SERVICE_TYPES.join(", ")})`)
        }
        if (!networkOrBiller || !planCode || !providerKey || !providerPlanId || !providerCostNairaRaw) {
          throw new Error(
            "service_type, network_or_biller, plan_code, provider_key, provider_plan_id, and provider_cost_naira are all required",
          )
        }

        const providerCostNaira = parseFloat(providerCostNairaRaw)
        if (isNaN(providerCostNaira) || providerCostNaira < 0) {
          throw new Error(`Invalid provider_cost_naira "${providerCostNairaRaw}"`)
        }

        const providerCostKobo = Math.round(providerCostNaira * 100)

        // Same natural key the UNIQUE constraint covers — check first so
        // we can tell the admin "this overwrote an existing mapping" vs
        // "this created a new one" instead of silently upserting either way.
        const existing = await findMappingByNaturalKey(serviceType, networkOrBiller, planCode, providerKey)

        await upsertPlanMapping(
          {
            serviceType,
            networkOrBiller,
            providerPlanId,
            providerCostKobo,
            providerPlanLabel,
            planCode,
            providerKey,
          },
          auth.uid,
        )

        if (existing) {
          const changedFields: string[] = []
          if (existing.providerPlanId !== providerPlanId) changedFields.push("plan ID")
          if (existing.providerCostKobo !== providerCostKobo) changedFields.push("cost")
          if ((existing.providerPlanLabel ?? "") !== (providerPlanLabel ?? "")) changedFields.push("label")

          results.push({
            row: rowNum,
            status: "updated",
            message:
              changedFields.length > 0
                ? `Duplicate of an existing mapping (${providerKey} for ${networkOrBiller} ${planCode}). Updated ${changedFields.join(", ")}.`
                : `Duplicate of an existing mapping (${providerKey} for ${networkOrBiller} ${planCode}). No changes, values were identical.`,
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
    const successCount = createdCount + updatedCount

    if (successCount > 0) {
      await d1Query(
        `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, after_json)
         VALUES (?, ?, 'provider_plan_mapping.bulk_upload', 'provider_plan_mappings', ?, ?)`,
        [randomUUID(), auth.uid, `bulk:${successCount}rows`, JSON.stringify({ createdCount, updatedCount, errorCount })],
      )
    }

    return NextResponse.json({ createdCount, updatedCount, errorCount, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bulk upload failed" }, { status: 500 })
  }
}
