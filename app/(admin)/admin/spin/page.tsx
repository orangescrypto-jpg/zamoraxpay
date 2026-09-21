// app/(admin)/admin/spin/page.tsx
// Spin & Win admin: master switch and global settings, ticket sources (with the
// streak-milestone days), a prize table per source, tier bonuses, gift tickets, log.
"use client"

import { useCallback, useEffect, useState } from "react"
import { adminApi, Notice, type AdminOverview } from "@/components/admin/spin/shared"
import { SpinSettingsPanel } from "@/components/admin/spin/SpinSettingsPanel"
import { SpinSourcesPanel } from "@/components/admin/spin/SpinSourcesPanel"
import { SpinPrizesPanel } from "@/components/admin/spin/SpinPrizesPanel"
import { SpinTierPanel } from "@/components/admin/spin/SpinTierPanel"
import { SpinGiftPanel } from "@/components/admin/spin/SpinGiftPanel"
import { SpinLogPanel } from "@/components/admin/spin/SpinLogPanel"

const TABS = [
  { key: "settings", label: "Settings" },
  { key: "sources", label: "Ticket sources" },
  { key: "prizes", label: "Prize tables" },
  { key: "tiers", label: "Tier bonuses" },
  { key: "gift", label: "Gift tickets" },
  { key: "log", label: "Log & payouts" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function AdminSpinPage() {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<TabKey>("settings")
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await adminApi<AdminOverview>("/api/admin/spin"))
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-primary">Spin &amp; Win</h1>
      <p className="mt-1 text-sm text-secondary">
        Every setting here takes effect immediately — no redeploy. Days and times are UTC. Prizes are spend-only: they can never be withdrawn.
      </p>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-primary text-primary" : "border-transparent text-secondary hover:text-primary"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        <Notice notice={notice} />
        {error && <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-secondary">Loading…</p>}

        {data && tab === "settings" && <SpinSettingsPanel data={data} onChanged={load} onNotice={setNotice} />}
        {data && tab === "sources" && <SpinSourcesPanel sources={data.sources} onChanged={load} onNotice={setNotice} />}
        {data && tab === "prizes" && <SpinPrizesPanel data={data} onChanged={load} onNotice={setNotice} />}
        {data && tab === "tiers" && <SpinTierPanel data={data} onChanged={load} onNotice={setNotice} />}
        {data && tab === "gift" && <SpinGiftPanel data={data} onNotice={setNotice} />}
        {data && tab === "log" && <SpinLogPanel data={data} />}
      </div>
    </div>
  )
}
