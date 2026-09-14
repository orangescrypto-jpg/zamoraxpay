// src/services/planCodeMigration.ts
// Service abstraction layer — one-off migration to re-key existing
// pricing_rules and provider_plan_mappings rows onto canonical
// plan_codes (see planNormalization.ts), so plans created before this
// normalization existed benefit from it too, not just future syncs.
//
// SAFETY MODEL:
//   - dryRun (default true): computes every change and returns a full
//     report WITHOUT writing anything. Always run this first and read
//     the report before running for real.
//   - Only merges rows whose canonical key ACTUALLY collides with
//     another row's canonical key under the same
//     (service_type, network_or_biller) scope — i.e. only fixes real
//     duplicates like the screenshots (same size+validity+category for
//     data plans, or same tier+validity for cable packages, just
//     spelled differently across providers).
//   - Rows the normalizer could not confidently parse (confident:
//     false — see planNormalization.ts) are left completely untouched
//     and listed separately in the report for manual review. A guess
//     is never written.
//   - When multiple old provider_plan_mappings rows for the SAME
//     provider collapse onto the same canonical plan_code (meaning
//     that provider had two rows that were always duplicates of each
//     other, not just cross-provider spelling differences), the
//     cheaper one wins and the other is deactivated (is_active = 0),
//     never deleted — so the report and the data both stay auditable.
//   - When multiple pricing_rules rows collapse onto the same
//     canonical code: if any of them has auto_priced = 0 (an admin's
//     manual price), THAT price wins over auto_priced ones. If more
//     than one manually-priced row collides, the cheapest manual price
//     wins and the loser is flagged in the report for manual review
//     rather than silently dropped — this is a real pricing decision,
//     not something the migration should decide alone.

import { d1Query } from "@/lib/d1"
import { canonicalPlanKey, normalizeNetworkOrBiller } from "@/src/services/planNormalization"

export interface MigrationChange {
  table: "pricing_rules" | "provider_plan_mappings"
  id: string
  serviceType: string
  networkOrBiller: string
  oldPlanCode: string
  newPlanCode: string
  action: "rename" | "merge-kept" | "merge-deactivated"
  note?: string
}

export interface MigrationReport {
  dryRun: boolean
  changes: MigrationChange[]
  lowConfidenceSkipped: Array<{ table: string; id: string; planCode: string; reason: string }>
  manualReviewNeeded: Array<{ table: string; canonicalKey: string; conflictingIds: string[]; reason: string }>
  summary: { renamed: number; merged: number; skipped: number; flaggedForReview: number }
}

export async function migratePlanCodes(dryRun: boolean, adminUserId: string, nativeDB?: any): Promise<MigrationReport> {
  const changes: MigrationChange[] = []
  const lowConfidenceSkipped: MigrationReport["lowConfidenceSkipped"] = []
  const manualReviewNeeded: MigrationReport["manualReviewNeeded"] = []

  // --- provider_plan_mappings ------------------------------------
  const mappingRows = (
    await d1Query(`SELECT * FROM provider_plan_mappings`, [], nativeDB)
  ).results as any[]

  // Group by (service_type, provider_key, canonical network) so we
  // only ever compare/merge rows that are for the SAME provider — two
  // different providers keep separate rows even after this pass
  // (that's the whole point: the router picks between them). Merging
  // only collapses a provider's own duplicate spellings of one plan.
  type MappingGroupKey = string
  const mappingGroups = new Map<MappingGroupKey, any[]>()

  for (const row of mappingRows) {
    const normalizedNetwork = normalizeNetworkOrBiller(row.network_or_biller)
    const { planCode: canonical, confident } = canonicalPlanKey(
      row.plan_code,
      normalizedNetwork,
      row.service_type,
    )
    if (!confident) {
      lowConfidenceSkipped.push({
        table: "provider_plan_mappings",
        id: row.id,
        planCode: row.plan_code,
        reason: "Could not confidently extract size/validity/category — left unchanged",
      })
      continue
    }
    const groupKey = `${row.service_type}::${normalizedNetwork}::${row.provider_key}::${canonical}`
    if (!mappingGroups.has(groupKey)) mappingGroups.set(groupKey, [])
    mappingGroups.get(groupKey)!.push({ ...row, _normalizedNetwork: normalizedNetwork, _canonical: canonical })
  }

  for (const [, group] of mappingGroups) {
    if (group.length === 1) {
      const row = group[0]
      if (row.plan_code !== row._canonical || row.network_or_biller !== row._normalizedNetwork) {
        changes.push({
          table: "provider_plan_mappings",
          id: row.id,
          serviceType: row.service_type,
          networkOrBiller: row._normalizedNetwork,
          oldPlanCode: row.plan_code,
          newPlanCode: row._canonical,
          action: "rename",
        })
      }
      continue
    }

    // Real duplicate within the same provider — same size/validity/
    // category, just written differently across two synced rows (or a
    // sync re-run before this normalization existed created both).
    // Cheapest wins; loser is deactivated, not deleted.
    const sorted = [...group].sort((a, b) => a.provider_cost_kobo - b.provider_cost_kobo)
    const winner = sorted[0]
    changes.push({
      table: "provider_plan_mappings",
      id: winner.id,
      serviceType: winner.service_type,
      networkOrBiller: winner._normalizedNetwork,
      oldPlanCode: winner.plan_code,
      newPlanCode: winner._canonical,
      action: "merge-kept",
      note: `Merged with ${sorted.length - 1} duplicate row(s) from the same provider; kept cheapest at ${winner.provider_cost_kobo} kobo`,
    })
    for (const loser of sorted.slice(1)) {
      changes.push({
        table: "provider_plan_mappings",
        id: loser.id,
        serviceType: loser.service_type,
        networkOrBiller: loser._normalizedNetwork,
        oldPlanCode: loser.plan_code,
        newPlanCode: loser._canonical,
        action: "merge-deactivated",
        note: `Duplicate of ${winner.id} at ${winner.provider_cost_kobo} kobo (this row was ${loser.provider_cost_kobo} kobo)`,
      })
    }
  }

  // --- pricing_rules ------------------------------------------------
  const pricingRows = (
    await d1Query(`SELECT * FROM pricing_rules WHERE plan_code IS NOT NULL`, [], nativeDB)
  ).results as any[]

  const pricingGroups = new Map<string, any[]>()
  for (const row of pricingRows) {
    const normalizedNetwork = normalizeNetworkOrBiller(row.network_or_biller)
    const { planCode: canonical, confident } = canonicalPlanKey(
      row.plan_code,
      normalizedNetwork,
      row.service_type,
    )
    if (!confident) {
      lowConfidenceSkipped.push({
        table: "pricing_rules",
        id: row.id,
        planCode: row.plan_code,
        reason: "Could not confidently extract size/validity/category — left unchanged",
      })
      continue
    }
    const groupKey = `${row.service_type}::${normalizedNetwork}::${canonical}`
    if (!pricingGroups.has(groupKey)) pricingGroups.set(groupKey, [])
    pricingGroups.get(groupKey)!.push({ ...row, _normalizedNetwork: normalizedNetwork, _canonical: canonical })
  }

  for (const [groupKey, group] of pricingGroups) {
    if (group.length === 1) {
      const row = group[0]
      if (row.plan_code !== row._canonical || row.network_or_biller !== row._normalizedNetwork) {
        changes.push({
          table: "pricing_rules",
          id: row.id,
          serviceType: row.service_type,
          networkOrBiller: row._normalizedNetwork,
          oldPlanCode: row.plan_code,
          newPlanCode: row._canonical,
          action: "rename",
        })
      }
      continue
    }

    // Multiple pricing_rules rows collapse onto one canonical code —
    // this happens when the same real plan was priced separately under
    // each provider's own spelling (e.g. admin priced
    // "75mb-1day-gifting" and "MTN/110MB/1Day" as if they were two
    // different ₦-priced products). A manually-set price (auto_priced
    // = 0) always outranks an auto-priced one. Two manual prices
    // colliding is a genuine pricing conflict — flag it, do not guess.
    const manual = group.filter((r) => r.auto_priced === 0)
    const auto = group.filter((r) => r.auto_priced !== 0)

    if (manual.length > 1) {
      manualReviewNeeded.push({
        table: "pricing_rules",
        canonicalKey: groupKey,
        conflictingIds: manual.map((r) => r.id),
        reason:
          `${manual.length} manually-priced rows all resolve to the same canonical plan ` +
          `but have different admin-set prices — pick which one should survive by hand.`,
      })
      // Still rename all of them in place (no merge) so the report is
      // complete, but do not deactivate any — that decision is yours.
      for (const row of group) {
        if (row.plan_code !== row._canonical || row.network_or_biller !== row._normalizedNetwork) {
          changes.push({
            table: "pricing_rules",
            id: row.id,
            serviceType: row.service_type,
            networkOrBiller: row._normalizedNetwork,
            oldPlanCode: row.plan_code,
            newPlanCode: row._canonical,
            action: "rename",
            note: "Left as separate row pending manual price-conflict review — see manualReviewNeeded",
          })
        }
      }
      continue
    }

    const winner = manual[0] ?? auto.sort((a, b) => a.retail_price_kobo - b.retail_price_kobo)[0]
    changes.push({
      table: "pricing_rules",
      id: winner.id,
      serviceType: winner.service_type,
      networkOrBiller: winner._normalizedNetwork,
      oldPlanCode: winner.plan_code,
      newPlanCode: winner._canonical,
      action: "merge-kept",
      note: manual.length
        ? "Kept the manually-priced row; deactivated auto-priced duplicate(s)"
        : "Kept lowest-priced auto-priced row; deactivated duplicate(s)",
    })
    for (const loser of group.filter((r) => r.id !== winner.id)) {
      changes.push({
        table: "pricing_rules",
        id: loser.id,
        serviceType: loser.service_type,
        networkOrBiller: loser._normalizedNetwork,
        oldPlanCode: loser.plan_code,
        newPlanCode: loser._canonical,
        action: "merge-deactivated",
        note: `Duplicate of ${winner.id}`,
      })
    }
  }

  if (!dryRun) {
    for (const change of changes) {
      if (change.action === "rename") {
        await d1Query(
          `UPDATE ${change.table} SET plan_code = ?, network_or_biller = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          [change.newPlanCode, change.networkOrBiller, adminUserId, change.id],
          nativeDB,
        )
      } else if (change.action === "merge-kept") {
        await d1Query(
          `UPDATE ${change.table} SET plan_code = ?, network_or_biller = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          [change.newPlanCode, change.networkOrBiller, adminUserId, change.id],
          nativeDB,
        )
      } else if (change.action === "merge-deactivated") {
        // Deactivate, never delete — keeps the row auditable and
        // trivially reversible if a merge decision turns out wrong.
        await d1Query(
          `UPDATE ${change.table} SET is_active = 0, plan_code = ?, network_or_biller = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          [change.newPlanCode, change.networkOrBiller, adminUserId, change.id],
          nativeDB,
        )
      }
    }
  }

  return {
    dryRun,
    changes,
    lowConfidenceSkipped,
    manualReviewNeeded,
    summary: {
      renamed: changes.filter((c) => c.action === "rename").length,
      merged: changes.filter((c) => c.action === "merge-kept").length,
      skipped: lowConfidenceSkipped.length,
      flaggedForReview: manualReviewNeeded.length,
    },
  }
}
