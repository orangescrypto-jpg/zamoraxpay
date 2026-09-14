"use client"

import { useState } from "react"
import { createClient } from "@/src/services/providers/supabase/client"

interface MigrationChange {
  table: "pricing_rules" | "provider_plan_mappings"
  id: string
  serviceType: string
  networkOrBiller: string
  oldPlanCode: string
  newPlanCode: string
  action: "rename" | "merge-kept" | "merge-deactivated"
  note?: string
}

interface MigrationReport {
  dryRun: boolean
  changes: MigrationChange[]
  lowConfidenceSkipped: Array<{ table: string; id: string; planCode: string; reason: string }>
  manualReviewNeeded: Array<{ table: string; canonicalKey: string; conflictingIds: string[]; reason: string }>
  summary: { renamed: number; merged: number; skipped: number; flaggedForReview: number }
}

const ACTION_COLOR: Record<string, string> = {
  rename: "#2563eb",
  "merge-kept": "#16a34a",
  "merge-deactivated": "#dc2626",
}

export default function PlanMigrationPage() {
  const [dryRunReport, setDryRunReport] = useState<MigrationReport | null>(null)
  const [liveReport, setLiveReport] = useState<MigrationReport | null>(null)
  const [running, setRunning] = useState<"dry" | "live" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function getAuthHeader() {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function parseResponse(res: Response) {
    const text = await res.text()
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return { error: `Server returned an unexpected response (HTTP ${res.status}). Please try again.` }
    }
  }

  async function runDryRun() {
    setRunning("dry")
    setError(null)
    setLiveReport(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/admin/provider-plan-mappings/migrate-plan-codes", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await parseResponse(res)
      if (!res.ok) {
        setError(data.error ?? "Dry run failed")
        setDryRunReport(null)
      } else {
        setDryRunReport(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry run failed")
    } finally {
      setRunning(null)
    }
  }

  async function runForReal() {
    setConfirmOpen(false)
    setRunning("live")
    setError(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch("/api/admin/provider-plan-mappings/migrate-plan-codes", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await parseResponse(res)
      if (!res.ok) {
        setError(data.error ?? "Migration failed")
      } else {
        setLiveReport(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration failed")
    } finally {
      setRunning(null)
    }
  }

  function downloadCSV(filename: string, rows: string[][]) {
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function downloadSkipped(report: MigrationReport) {
    downloadCSV("plan-migration-skipped.csv", [
      ["table", "id", "plan_code", "reason"],
      ...report.lowConfidenceSkipped.map((r) => [r.table, r.id, r.planCode, r.reason]),
    ])
  }

  function downloadAllChanges(report: MigrationReport) {
    downloadCSV("plan-migration-changes.csv", [
      ["action", "table", "service_type", "network_or_biller", "old_plan_code", "new_plan_code", "note"],
      ...report.changes.map((c) => [
        c.action,
        c.table,
        c.serviceType,
        c.networkOrBiller,
        c.oldPlanCode,
        c.newPlanCode,
        c.note ?? "",
      ]),
    ])
  }

  function renderReport(report: MigrationReport) {
    return (
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat label="Renamed" value={report.summary.renamed} />
          <Stat label="Merged" value={report.summary.merged} />
          <Stat label="Skipped (low confidence)" value={report.summary.skipped} />
          <Stat label="Flagged for review" value={report.summary.flaggedForReview} />
        </div>

        {report.manualReviewNeeded.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ color: "#b45309" }}>⚠ Needs your decision</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Table</th>
                  <th style={thStyle}>Canonical key</th>
                  <th style={thStyle}>Conflicting IDs</th>
                  <th style={thStyle}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {report.manualReviewNeeded.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.table}</td>
                    <td style={tdStyle}>{r.canonicalKey}</td>
                    <td style={tdStyle}>{r.conflictingIds.join(", ")}</td>
                    <td style={tdStyle}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {report.lowConfidenceSkipped.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <h3 style={{ margin: "0 0 8px" }}>Left unchanged (couldn't confidently parse)</h3>
              <button onClick={() => downloadSkipped(report)} style={btnStyle("#374151")}>
                ⬇ Download CSV
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Table</th>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Plan code</th>
                    <th style={thStyle}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lowConfidenceSkipped.map((r, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{r.table}</td>
                      <td style={tdStyle}>{r.id}</td>
                      <td style={tdStyle}>{r.planCode}</td>
                      <td style={tdStyle}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ margin: "0 0 8px" }}>All changes ({report.changes.length})</h3>
            <button onClick={() => downloadAllChanges(report)} style={btnStyle("#374151")}>
              ⬇ Download CSV
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Table</th>
                  <th style={thStyle}>Service</th>
                  <th style={thStyle}>Network/Biller</th>
                  <th style={thStyle}>Old code</th>
                  <th style={thStyle}>New code</th>
                  <th style={thStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {report.changes.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, color: ACTION_COLOR[c.action], fontWeight: 600 }}>{c.action}</td>
                    <td style={tdStyle}>{c.table}</td>
                    <td style={tdStyle}>{c.serviceType}</td>
                    <td style={tdStyle}>{c.networkOrBiller}</td>
                    <td style={tdStyle}>{c.oldPlanCode}</td>
                    <td style={tdStyle}>{c.newPlanCode}</td>
                    <td style={tdStyle}>{c.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>Plan Code Migration</h1>
      <p style={{ color: "#555" }}>
        Re-keys existing pricing and provider-mapping rows onto canonical plan codes, so the same
        real-world plan written differently by different providers (casing, "1Day" vs "1-day", etc.)
        merges into one buyer-facing plan with all its providers mapped underneath. Validity and
        category are never merged — only formatting differences are folded.
      </p>

      <div style={{ display: "flex", gap: 12, margin: "20px 0", flexWrap: "wrap" }}>
        <button onClick={runDryRun} disabled={running !== null} style={btnStyle("#2563eb")}>
          {running === "dry" ? "Running dry run..." : "Run Dry Run"}
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={running !== null || !dryRunReport}
          style={btnStyle(dryRunReport ? "#dc2626" : "#9ca3af")}
          title={!dryRunReport ? "Run a dry run first" : ""}
        >
          {running === "live" ? "Running..." : "Run For Real"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {confirmOpen && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            padding: 16,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, marginBottom: 12 }}>
            This will write to pricing_rules and provider_plan_mappings for real. Rows are deactivated,
            never deleted, so it's reversible — but confirm you've reviewed the dry run above first.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runForReal} style={btnStyle("#dc2626")}>
              Yes, run for real
            </button>
            <button onClick={() => setConfirmOpen(false)} style={btnStyle("#6b7280")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {liveReport && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 6, marginBottom: 8 }}>
          Migration applied.
        </div>
      )}

      {liveReport ? renderReport(liveReport) : dryRunReport ? renderReport(dryRunReport) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#f3f4f6", padding: "10px 16px", borderRadius: 6 }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#555" }}>{label}</div>
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    border: "none",
    padding: "10px 18px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap",
  }
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
}
const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  padding: "6px 8px",
  background: "#f9fafb",
}
const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  padding: "6px 8px",
}
