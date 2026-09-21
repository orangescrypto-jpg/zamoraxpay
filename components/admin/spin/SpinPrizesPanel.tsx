// components/admin/spin/SpinPrizesPanel.tsx
// The prize table of each source: add / edit / delete prizes, weights (chance),
// caps (jackpot limits), guarantee prize flag, and a live expected-cost readout.
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  adminApi,
  btnDanger,
  btnGhost,
  btnPrimary,
  Field,
  fmt,
  inputCls,
  koboToNaira,
  nairaToKobo,
  PRIZE_TYPE_LABELS,
  Toggle,
  type AdminOverview,
  type AdminPrize,
} from "@/components/admin/spin/shared"
import { labelFromPlanCode } from "@/src/services/planLabel"

interface PlanRule {
  network_or_biller: string
  plan_code: string | null
  retail_price_kobo?: number
  is_active?: number
}

interface Draft {
  id?: string
  label: string
  prizeType: string
  amount: string // naira
  discountPercent: string
  maxDiscount: string // naira
  discountServices: string
  discountMinPurchase: string // naira
  voucherNetwork: string
  voucherAnyNetwork: boolean
  voucherSampleNetwork: string
  voucherPlanCode: string
  tokenCount: string
  rewardValidDays: string
  weight: string
  cost: string // naira, blank = automatic
  maxWinsPerDay: string
  maxWinsPerWeek: string
  isGuaranteePrize: boolean
  isJackpot: boolean
  isActive: boolean
  color: string
  sortOrder: string
}

const blank: Draft = {
  label: "",
  prizeType: "wallet_credit",
  amount: "",
  discountPercent: "5",
  maxDiscount: "50",
  discountServices: "",
  discountMinPurchase: "0",
  voucherNetwork: "",
  voucherAnyNetwork: false,
  voucherSampleNetwork: "",
  voucherPlanCode: "",
  tokenCount: "1",
  rewardValidDays: "7",
  weight: "10",
  cost: "",
  maxWinsPerDay: "0",
  maxWinsPerWeek: "0",
  isGuaranteePrize: false,
  isJackpot: false,
  isActive: true,
  color: "",
  sortOrder: "",
}

function fromPrize(p: AdminPrize): Draft {
  const isAnyNetwork = p.prizeType === "data_voucher" && !p.voucherNetwork && !!p.voucherPlanCode?.startsWith("any:")
  return {
    id: p.id,
    label: p.label,
    prizeType: p.prizeType,
    amount: koboToNaira(p.amountKobo),
    discountPercent: String(p.discountPercent),
    maxDiscount: koboToNaira(p.maxDiscountKobo),
    discountServices: p.discountServices ?? "",
    discountMinPurchase: koboToNaira(p.discountMinPurchaseKobo),
    voucherNetwork: p.voucherNetwork ?? "",
    voucherAnyNetwork: isAnyNetwork,
    voucherSampleNetwork: "",
    voucherPlanCode: p.voucherPlanCode ?? "",
    tokenCount: String(p.tokenCount || 1),
    rewardValidDays: String(p.rewardValidDays),
    weight: String(p.weight),
    cost: p.costKobo ? koboToNaira(p.costKobo) : "",
    maxWinsPerDay: String(p.maxWinsPerDay),
    maxWinsPerWeek: String(p.maxWinsPerWeek),
    isGuaranteePrize: p.isGuaranteePrize,
    isJackpot: p.isJackpot,
    isActive: p.isActive,
    color: p.color ?? "",
    sortOrder: String(p.sortOrder),
  }
}

export function SpinPrizesPanel({ data, onChanged, onNotice }: { data: AdminOverview; onChanged: () => void; onNotice: (n: { ok: boolean; text: string }) => void }) {
  const [sourceKey, setSourceKey] = useState(data.sources[0]?.sourceKey ?? "")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [plans, setPlans] = useState<PlanRule[]>([])

  const source = useMemo(() => data.sources.find((s) => s.sourceKey === sourceKey), [data.sources, sourceKey])

  // Data plans come from the pricing table, so the admin can only pick a plan that really exists.
  useEffect(() => {
    if (draft?.prizeType !== "data_voucher" || plans.length > 0) return
    ;(async () => {
      try {
        const json = await adminApi<{ rules: PlanRule[] }>("/api/admin/pricing?serviceType=data")
        setPlans((json.rules ?? []).filter((r) => r.plan_code))
      } catch {
        /* the admin can still type a plan code */
      }
    })()
  }, [draft?.prizeType, plans.length])

  if (!source) return null
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await adminApi("/api/admin/spin/prizes", {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          sourceKey,
          label: draft.label,
          prizeType: draft.prizeType,
          amountKobo: nairaToKobo(draft.amount),
          discountPercent: Number(draft.discountPercent),
          maxDiscountKobo: nairaToKobo(draft.maxDiscount),
          discountServices: draft.discountServices,
          discountMinPurchaseKobo: nairaToKobo(draft.discountMinPurchase),
          voucherNetwork: draft.voucherAnyNetwork ? null : draft.voucherNetwork || null,
          voucherAnyNetwork: draft.voucherAnyNetwork,
          voucherSampleNetwork: draft.voucherAnyNetwork ? draft.voucherSampleNetwork : undefined,
          voucherPlanCode: draft.voucherPlanCode || null,
          tokenCount: Number(draft.tokenCount),
          rewardValidDays: Number(draft.rewardValidDays),
          weight: Number(draft.weight),
          costKobo: draft.cost === "" ? "" : nairaToKobo(draft.cost),
          maxWinsPerDay: Number(draft.maxWinsPerDay),
          maxWinsPerWeek: Number(draft.maxWinsPerWeek),
          isGuaranteePrize: draft.isGuaranteePrize,
          isJackpot: draft.isJackpot,
          isActive: draft.isActive,
          color: draft.color || null,
          sortOrder: draft.sortOrder === "" ? null : Number(draft.sortOrder),
        }),
      })
      onNotice({ ok: true, text: "Prize saved." })
      setDraft(null)
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: AdminPrize) {
    if (!confirm(`Permanently delete "${p.label}"? Past wins are not affected.`)) return
    try {
      await adminApi("/api/admin/spin/prizes", { method: "DELETE", body: JSON.stringify({ id: p.id }) })
      onNotice({ ok: true, text: "Prize deleted." })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    }
  }

  async function toggleActive(p: AdminPrize) {
    try {
      await adminApi("/api/admin/spin/prizes", {
        method: "POST",
        body: JSON.stringify({ ...p, id: p.id, isActive: !p.isActive, costKobo: p.costKobo }),
      })
      onChanged()
    } catch (e) {
      onNotice({ ok: false, text: (e as Error).message })
    }
  }

  const t = draft?.prizeType
  const networkPlans = plans.filter((r) => r.network_or_biller === draft?.voucherNetwork)

  // For "All providers (any network)": one option per distinct size/validity,
  // deduped across networks, so the admin picks "1GB - 30 days" once instead
  // of once per network. Whichever network's row happens to match first just
  // supplies the representative plan_code/label/estimated cost — the ACTUAL
  // network (and its own price) is resolved per-user at claim time.
  const anyNetworkPlanOptions = useMemo(() => {
    const seen = new Map<string, { plan_code: string; network_or_biller: string; label: string }>()
    for (const r of plans) {
      if (!r.plan_code) continue
      const key = r.plan_code.match(/^\d+mb-\d+d/i)?.[0]?.toLowerCase()
      if (!key || seen.has(key)) continue
      seen.set(key, { plan_code: r.plan_code, network_or_biller: r.network_or_biller, label: labelFromPlanCode(r.plan_code) })
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [plans])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-primary">Prize table for</label>
        <select
          value={sourceKey}
          onChange={(e) => {
            setSourceKey(e.target.value)
            setDraft(null)
          }}
          className={`${inputCls} max-w-xs`}
        >
          {data.sources.map((s) => (
            <option key={s.sourceKey} value={s.sourceKey}>
              {s.label}
            </option>
          ))}
        </select>
        <button className={btnPrimary} onClick={() => setDraft({ ...blank })}>
          + Add prize
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-white p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-secondary">Average cost per spin</p>
          <p className="text-lg font-bold text-primary">{fmt(source.expectedCostPerSpinKobo)}</p>
        </div>
        <div>
          <p className="text-xs text-secondary">Chance of winning something</p>
          <p className="text-lg font-bold text-primary">{source.winChancePercent}%</p>
        </div>
        <div>
          <p className="text-xs text-secondary">Paid out today / daily budget</p>
          <p className="text-lg font-bold text-primary">
            {fmt(source.spentTodayKobo)} / {source.dailyBudgetKobo > 0 ? fmt(source.dailyBudgetKobo) : "no cap"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-secondary">
            <tr>
              <th className="px-3 py-2">Prize</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Chance</th>
              <th className="px-3 py-2">Cost to you</th>
              <th className="px-3 py-2">Caps</th>
              <th className="px-3 py-2">On</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {source.prizes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-secondary">
                  No prizes yet — this wheel would always show &quot;better luck next time&quot;.
                </td>
              </tr>
            )}
            {source.prizes.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                <td className="px-3 py-2 font-medium text-primary">
                  {p.label}
                  {p.isJackpot && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">JACKPOT</span>}
                  {p.isGuaranteePrize && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">GUARANTEE</span>}
                </td>
                <td className="px-3 py-2 text-xs text-secondary">{PRIZE_TYPE_LABELS[p.prizeType] ?? p.prizeType}</td>
                <td className="px-3 py-2">{p.weight}</td>
                <td className="px-3 py-2">{p.chancePercent}%</td>
                <td className="px-3 py-2">{fmt(p.costKobo)}</td>
                <td className="px-3 py-2 text-xs text-secondary">
                  {p.maxWinsPerDay > 0 ? `${p.maxWinsPerDay}/day` : ""} {p.maxWinsPerWeek > 0 ? `${p.maxWinsPerWeek}/7d` : ""}
                  {p.maxWinsPerDay === 0 && p.maxWinsPerWeek === 0 ? "—" : ""}
                </td>
                <td className="px-3 py-2">
                  <Toggle checked={p.isActive} onChange={() => toggleActive(p)} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button className="mr-2 text-xs font-semibold text-primary underline" onClick={() => setDraft(fromPrize(p))}>
                    Edit
                  </button>
                  <button className="text-xs font-semibold text-red-600 underline" onClick={() => remove(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <section className="space-y-4 rounded-xl border border-primary/30 bg-white p-4">
          <h3 className="text-sm font-semibold text-primary">{draft.id ? "Edit prize" : "New prize"}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Label on the wheel" help="Keep it short — it is written on a wheel segment.">
              <input value={draft.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Prize type">
              <select value={draft.prizeType} onChange={(e) => set({ prizeType: e.target.value })} className={inputCls}>
                {data.prizeTypes.map((pt) => (
                  <option key={pt} value={pt}>
                    {PRIZE_TYPE_LABELS[pt] ?? pt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weight (chance)" help="Relative chance. A prize with weight 10 is twice as likely as weight 5.">
              <input type="number" min={0} value={draft.weight} onChange={(e) => set({ weight: e.target.value })} className={inputCls} />
            </Field>

            {(t === "wallet_credit" || t === "airtime_voucher") && (
              <Field label={t === "wallet_credit" ? "Credit amount (₦) — spend-only" : "Airtime value (₦)"}>
                <input type="number" min={0} step="0.01" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} className={inputCls} />
              </Field>
            )}

            {t === "discount" && (
              <>
                <Field label="Discount %">
                  <input type="number" min={1} max={100} value={draft.discountPercent} onChange={(e) => set({ discountPercent: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Maximum discount (₦)" help="The most this can ever take off — also what it costs you at worst.">
                  <input type="number" min={0} step="0.01" value={draft.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Minimum purchase (₦)">
                  <input type="number" min={0} step="0.01" value={draft.discountMinPurchase} onChange={(e) => set({ discountMinPurchase: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Services it applies to" help={`Comma list. Blank = ${data.defaultDiscountServices.join(", ")}.`}>
                  <input value={draft.discountServices} onChange={(e) => set({ discountServices: e.target.value })} className={inputCls} placeholder="airtime,data" />
                </Field>
              </>
            )}

            {(t === "airtime_voucher" || t === "data_voucher") && (
              <Field label={t === "data_voucher" ? "Network" : "Lock to network (optional)"}>
                <select
                  value={draft.voucherAnyNetwork ? "__any__" : draft.voucherNetwork}
                  onChange={(e) => {
                    if (e.target.value === "__any__") {
                      set({ voucherAnyNetwork: true, voucherNetwork: "", voucherSampleNetwork: "", voucherPlanCode: "" })
                    } else {
                      set({ voucherAnyNetwork: false, voucherNetwork: e.target.value, voucherSampleNetwork: "", voucherPlanCode: "" })
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">{t === "data_voucher" ? "Choose…" : "Any — user picks"}</option>
                  {data.networks.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  {t === "data_voucher" && <option value="__any__">All providers (any network)</option>}
                </select>
                {t === "data_voucher" && draft.voucherAnyNetwork && (
                  <p className="mt-1 text-xs text-secondary">
                    The winner&apos;s own number decides the network at claim time. Price and expiry follow whichever
                    network they&apos;re actually on.
                  </p>
                )}
              </Field>
            )}

            {t === "data_voucher" && (
              <Field label="Data plan" help="Only plans that exist in your Pricing table can be used.">
                {draft.voucherAnyNetwork ? (
                  anyNetworkPlanOptions.length > 0 ? (
                    <select
                      value={draft.voucherPlanCode}
                      onChange={(e) => {
                        const opt = anyNetworkPlanOptions.find((o) => o.plan_code === e.target.value)
                        set({ voucherPlanCode: e.target.value, voucherSampleNetwork: opt?.network_or_biller ?? "" })
                      }}
                      className={inputCls}
                    >
                      <option value="">Choose…</option>
                      {anyNetworkPlanOptions.map((o) => (
                        <option key={o.plan_code} value={o.plan_code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-secondary">No data plans found in your Pricing table yet.</p>
                  )
                ) : networkPlans.length > 0 ? (
                  <select value={draft.voucherPlanCode} onChange={(e) => set({ voucherPlanCode: e.target.value })} className={inputCls}>
                    <option value="">Choose…</option>
                    {networkPlans.map((r) => (
                      <option key={r.plan_code!} value={r.plan_code!}>
                        {labelFromPlanCode(r.plan_code!)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={draft.voucherPlanCode} onChange={(e) => set({ voucherPlanCode: e.target.value })} className={inputCls} placeholder="plan code" />
                )}
              </Field>
            )}

            {t === "streak_protection" && (
              <Field label="Shields granted" help="Each shield forgives one missed check-in day.">
                <input type="number" min={1} value={draft.tokenCount} onChange={(e) => set({ tokenCount: e.target.value })} className={inputCls} />
              </Field>
            )}

            {(t === "discount" || t === "airtime_voucher" || t === "data_voucher") && (
              <Field label="Valid for (days)" help="How long the winner has to use it.">
                <input type="number" min={1} value={draft.rewardValidDays} onChange={(e) => set({ rewardValidDays: e.target.value })} className={inputCls} />
              </Field>
            )}

            {t !== "nothing" && (
              <>
                <Field label="Max wins per day" help="Jackpot cap. 0 = unlimited.">
                  <input type="number" min={0} value={draft.maxWinsPerDay} onChange={(e) => set({ maxWinsPerDay: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Max wins per 7 days" help="Rolling 7 days. 0 = unlimited.">
                  <input type="number" min={0} value={draft.maxWinsPerWeek} onChange={(e) => set({ maxWinsPerWeek: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Cost to you (₦) — override" help="Leave blank to calculate it automatically. Used for the daily budget and cost readout.">
                  <input type="number" min={0} step="0.01" value={draft.cost} onChange={(e) => set({ cost: e.target.value })} className={inputCls} />
                </Field>
              </>
            )}

            <Field label="Colour (optional)" help="Hex like #2563EB.">
              <input value={draft.color} onChange={(e) => set({ color: e.target.value })} className={inputCls} placeholder="#2563EB" />
            </Field>
            <Field label="Position on wheel" help="Lower comes first. Blank = last.">
              <input type="number" min={0} value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-6">
            {t !== "nothing" && <Toggle checked={draft.isGuaranteePrize} onChange={(v) => set({ isGuaranteePrize: v })} label="Can be the guaranteed prize" />}
            {t !== "nothing" && <Toggle checked={draft.isJackpot} onChange={(v) => set({ isJackpot: v })} label="Show as jackpot (gold)" />}
            <Toggle checked={draft.isActive} onChange={(v) => set({ isActive: v })} label="Active" />
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save prize"}
            </button>
            <button onClick={() => setDraft(null)} className={btnGhost}>
              Cancel
            </button>
            {draft.id && (
              <button
                onClick={() => {
                  const p = source.prizes.find((x) => x.id === draft.id)
                  if (p) remove(p)
                  setDraft(null)
                }}
                className={btnDanger}
              >
                Delete
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
