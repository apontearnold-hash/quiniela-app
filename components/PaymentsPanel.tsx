"use client"

import { useState, useEffect, useCallback } from "react"
import { useT } from "@/components/LangProvider"

interface PoolOption { id: string; name: string }
interface PaymentRow {
  user_id: string
  email: string
  display_name: string | null
  quiniela_count: number
  total_due: number
  amount_paid: number
  pending: number
  notes: string | null
  currency: string
}
interface PoolInfo { name: string; price_per_quiniela: number; currency: string }

export default function PaymentsPanel() {
  const t = useT()
  const [pools, setPools] = useState<PoolOption[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string>("")
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline edit state: user_id → { amount, notes }
  const [editing, setEditing] = useState<Record<string, { amount: string; notes: string }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/admin/pools")
      .then(r => r.json())
      .then(d => {
        const list: PoolOption[] = (d.pools ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        setPools(list)
        if (list.length > 0) setSelectedPoolId(list[0].id)
      })
      .catch(() => setError(t("payments_err_leagues")))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPayments = useCallback(async (poolId: string) => {
    if (!poolId) return
    setLoading(true); setError(null); setRows([]); setPoolInfo(null)
    try {
      const res = await fetch(`/api/admin/payments?pool_id=${poolId}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t("payments_err_load")); return }
      setPoolInfo(data.pool)
      setRows(data.rows ?? [])
    } catch {
      setError(t("payments_err_network"))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedPoolId) loadPayments(selectedPoolId)
  }, [selectedPoolId, loadPayments])

  function startEdit(row: PaymentRow) {
    setEditing(prev => ({
      ...prev,
      [row.user_id]: { amount: row.amount_paid.toString(), notes: row.notes ?? "" },
    }))
    setSaveMsg(prev => ({ ...prev, [row.user_id]: "" }))
  }

  function cancelEdit(userId: string) {
    setEditing(prev => { const n = { ...prev }; delete n[userId]; return n })
    setSaveMsg(prev => { const n = { ...prev }; delete n[userId]; return n })
  }

  async function saveEdit(userId: string) {
    const e = editing[userId]
    if (!e) return
    setSaving(prev => ({ ...prev, [userId]: true }))
    setSaveMsg(prev => ({ ...prev, [userId]: "" }))
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pool_id: selectedPoolId,
        user_id: userId,
        amount_paid: e.amount,
        notes: e.notes || null,
      }),
    })
    const data = await res.json()
    setSaving(prev => ({ ...prev, [userId]: false }))
    if (res.ok) {
      setSaveMsg(prev => ({ ...prev, [userId]: t("saved") }))
      cancelEdit(userId)
      loadPayments(selectedPoolId)
    } else {
      setSaveMsg(prev => ({ ...prev, [userId]: `Error: ${data.error}` }))
    }
  }

  const totalDue     = rows.reduce((s, r) => s + r.total_due, 0)
  const totalPaid    = rows.reduce((s, r) => s + r.amount_paid, 0)
  const totalPending = rows.reduce((s, r) => s + r.pending, 0)
  const currency     = poolInfo?.currency ?? rows[0]?.currency ?? "USD"

  return (
    <div className="flex flex-col gap-4">
      {/* Pool selector */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedPoolId}
          onChange={e => setSelectedPoolId(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: "white", border: "1px solid #d1d5db", color: "#111827" }}
        >
          {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {pools.length === 0 && <option value="">{t("payments_loading_leagues")}</option>}
        </select>
        {poolInfo && (
          <span className="text-xs text-[#6b7280]">
            {t("payments_price_label")} <strong className="text-[#111827]">${poolInfo.price_per_quiniela} {poolInfo.currency}</strong> {t("payments_per_q")}
          </span>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {loading && <p className="text-[#6b7280] text-xs">{t("payments_loading")}</p>}

      {/* Summary strip */}
      {rows.length > 0 && (
        <div
          className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: "#0d1f11", border: "1px solid #2a5438" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[#7ab88a]">{t("payments_total_expected")}</span>
            <span className="text-white font-bold">${totalDue.toFixed(0)} {currency}</span>
          </div>
          <span className="text-[#2a5438]">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#7ab88a]">{t("payments_paid_lbl")}</span>
            <span className="text-green-400 font-bold">${totalPaid.toFixed(0)}</span>
          </div>
          <span className="text-[#2a5438]">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#7ab88a]">{t("payments_pending_lbl")}</span>
            <span className={`font-bold ${totalPending > 0 ? "text-[#F5C518]" : "text-green-400"}`}>
              ${totalPending.toFixed(0)}
            </span>
          </div>
          <span className="text-[#2a5438]">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#7ab88a]">{t("payments_participants")}</span>
            <span className="text-white font-bold">{rows.length}</span>
          </div>
        </div>
      )}

      {/* Member table */}
      {rows.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Table header */}
          <div
            className="grid text-xs font-bold uppercase tracking-wide px-4 py-2.5"
            style={{
              gridTemplateColumns: "1fr 60px 80px 80px 80px 120px 72px",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              color: "#6b7280",
            }}
          >
            <span>{t("payments_col_participant")}</span>
            <span className="text-right">Q</span>
            <span className="text-right">{t("payments_col_owes")}</span>
            <span className="text-right">{t("payments_col_paid")}</span>
            <span className="text-right">{t("payments_col_pending")}</span>
            <span className="pl-2">{t("payments_col_notes")}</span>
            <span />
          </div>

          {rows.map((row, i) => {
            const isEditing = !!editing[row.user_id]
            const isSaving  = !!saving[row.user_id]
            const msg       = saveMsg[row.user_id]
            const isPaid    = row.pending === 0 && row.total_due > 0
            const name      = row.display_name ?? row.email

            return (
              <div
                key={row.user_id}
                style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
              >
                {/* Main row */}
                <div
                  className="grid items-center px-4 py-3 text-sm"
                  style={{ gridTemplateColumns: "1fr 60px 80px 80px 80px 120px 72px" }}
                >
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: "#111827" }}>{name}</p>
                    {row.display_name && (
                      <p className="text-xs truncate" style={{ color: "#9ca3af" }}>{row.email}</p>
                    )}
                  </div>

                  {/* Quiniela count */}
                  <span className="text-right text-xs font-bold" style={{ color: "#374151" }}>
                    {row.quiniela_count}
                  </span>

                  {/* Total due */}
                  <span className="text-right text-xs" style={{ color: "#374151" }}>
                    ${row.total_due.toFixed(0)}
                  </span>

                  {/* Amount paid */}
                  {isEditing ? (
                    <div className="flex justify-end pr-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editing[row.user_id].amount}
                        onChange={e => setEditing(prev => ({
                          ...prev,
                          [row.user_id]: { ...prev[row.user_id], amount: e.target.value },
                        }))}
                        className="w-16 px-1.5 py-1 rounded text-xs text-right"
                        style={{ border: "1px solid #d1d5db", color: "#111827" }}
                      />
                    </div>
                  ) : (
                    <span className="text-right text-xs font-semibold text-green-600">
                      ${row.amount_paid.toFixed(0)}
                    </span>
                  )}

                  {/* Pending */}
                  <span
                    className="text-right text-xs font-bold"
                    style={{ color: isPaid ? "#16a34a" : row.pending > 0 ? "#F5C518" : "#9ca3af" }}
                  >
                    {isPaid ? t("payments_up_to_date") : `$${row.pending.toFixed(0)}`}
                  </span>

                  {/* Notes */}
                  {isEditing ? (
                    <input
                      type="text"
                      placeholder={t("payments_note_ph")}
                      value={editing[row.user_id].notes}
                      onChange={e => setEditing(prev => ({
                        ...prev,
                        [row.user_id]: { ...prev[row.user_id], notes: e.target.value },
                      }))}
                      className="pl-2 px-2 py-1 rounded text-xs"
                      style={{ border: "1px solid #d1d5db", color: "#111827" }}
                    />
                  ) : (
                    <span className="pl-2 text-xs truncate" style={{ color: "#9ca3af" }}>
                      {row.notes ?? "—"}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 justify-end">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(row.user_id)}
                          disabled={isSaving}
                          className="px-2 py-1 rounded text-xs font-bold text-black disabled:opacity-50"
                          style={{ background: "#F5C518" }}
                        >
                          {isSaving ? "…" : "OK"}
                        </button>
                        <button
                          onClick={() => cancelEdit(row.user_id)}
                          disabled={isSaving}
                          className="px-2 py-1 rounded text-xs font-medium disabled:opacity-50"
                          style={{ border: "1px solid #d1d5db", color: "#6b7280" }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="px-2 py-1 rounded text-xs font-medium hover:bg-gray-100"
                        style={{ border: "1px solid #e5e7eb", color: "#6b7280" }}
                      >
                        {t("edit")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Save message */}
                {msg && (
                  <p className={`px-4 pb-2 text-xs ${msg.startsWith("Error") ? "text-red-400" : "text-green-500"}`}>
                    {msg}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && rows.length === 0 && selectedPoolId && !error && (
        <p className="text-[#9ca3af] text-xs">{t("payments_no_members")}</p>
      )}
    </div>
  )
}
