"use client"

import { useState } from "react"

interface PoolRow {
  id: string
  name: string
  description: string | null
  price_per_quiniela: number
  currency: string
  is_active: boolean
  knockout_editing_open: boolean
  start_phase: string
  allow_carryover_points: boolean
  prize_type: "money" | "physical"
  prize_description: string | null
  prize_1st: string | null
  prize_2nd: string | null
  prize_3rd: string | null
  created_at: string
  member_count: number
  quiniela_count: number
}

interface CarryoverQuiniela {
  id: string
  name: string
  carryover_points: number
  profiles: { display_name: string | null; email: string | null } | null
}

const START_PHASE_OPTIONS = [
  { value: "groups", label: "Fase de grupos (normal)" },
  { value: "round_of_32", label: "Ronda de 32 (omite grupos)" },
  { value: "round_of_16", label: "Octavos de Final" },
]

interface EmailMember {
  name: string
  email: string
}

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

// ── Shared style tokens ───────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: "8px",
  border: "1px solid #e2e8f0", background: "white", color: "#0f172a",
  fontSize: "13px", boxSizing: "border-box",
}
const lbl: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }
const btnPrimary: React.CSSProperties = { padding: "8px 20px", borderRadius: "8px", background: "#2563eb", color: "white", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" }
const btnSecondary: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "white", border: "1px solid #e2e8f0", color: "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }
const btnDestructive: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "white", border: "1px solid #fca5a5", color: "#dc2626", fontWeight: 600, fontSize: "12px", cursor: "pointer" }
const btnDestructiveConfirm: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "#dc2626", border: "none", color: "white", fontWeight: 700, fontSize: "12px", cursor: "pointer" }

// ── Prize type toggle ─────────────────────────────────────────────────────────

function PrizeTypeToggle({
  value,
  onChange,
}: {
  value: "money" | "physical"
  onChange: (v: "money" | "physical") => void
}) {
  return (
    <div>
      <label style={lbl}>Tipo de premio</label>
      <div style={{ display: "flex", gap: "8px" }}>
        {(["money", "physical"] as const).map(pt => (
          <button
            key={pt}
            type="button"
            onClick={() => onChange(pt)}
            style={{
              ...btnSecondary,
              background: value === pt ? (pt === "money" ? "#dbeafe" : "#fef3c7") : "white",
              borderColor: value === pt ? (pt === "money" ? "#93c5fd" : "#fde68a") : "#e2e8f0",
              color: value === pt ? (pt === "money" ? "#1d4ed8" : "#92400e") : "#334155",
            }}
          >
            {pt === "money" ? "💰 Dinero" : "🎁 Premio físico"}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Three physical prize fields ───────────────────────────────────────────────

function PhysicalPrizeFields({
  prize_1st,
  prize_2nd,
  prize_3rd,
  onChange,
}: {
  prize_1st: string
  prize_2nd: string
  prize_3rd: string
  onChange: (field: "prize_1st" | "prize_2nd" | "prize_3rd", value: string) => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {(["prize_1st", "prize_2nd", "prize_3rd"] as const).map((field, i) => {
        const icons = ["🥇", "🥈", "🥉"]
        const labels = ["Premio 1er lugar", "Premio 2do lugar", "Premio 3er lugar"]
        const placeholders = ["Ej. Cena para 2 en restaurante X", "Ej. Noche de hotel", "Ej. Tarjeta de regalo $50"]
        return (
          <div key={field}>
            <label style={lbl}>{icons[i]} {labels[i]}</label>
            <input
              type="text"
              value={field === "prize_1st" ? prize_1st : field === "prize_2nd" ? prize_2nd : prize_3rd}
              onChange={e => onChange(field, e.target.value)}
              placeholder={placeholders[i]}
              style={inp}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const emptyPhysical = { prize_1st: "", prize_2nd: "", prize_3rd: "" }

export default function PoolsPanel({ pools: initialPools }: { pools: PoolRow[] }) {
  const [pools, setPools] = useState(initialPools)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: "", description: "", price: "0", currency: "USD", is_active: true,
    prize_type: "money" as "money" | "physical",
    prize_1st: "", prize_2nd: "", prize_3rd: "",
  })
  const [editSaving, setEditSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: "", description: "", price: "0", currency: "USD",
    prize_type: "money" as "money" | "physical",
    prize_1st: "", prize_2nd: "", prize_3rd: "",
  })
  const [creating, setCreating] = useState(false)

  // ── Email export state ────────────────────────────────────────────────────
  const [emailPanelId, setEmailPanelId] = useState<string | null>(null)
  const [emailMembers, setEmailMembers] = useState<EmailMember[]>([])
  const [emailLoading, setEmailLoading] = useState(false)

  // ── Carryover panel state ─────────────────────────────────────────────────
  const [carryoverPanelId, setCarryoverPanelId] = useState<string | null>(null)
  const [carryoverQuinielas, setCarryoverQuinielas] = useState<CarryoverQuiniela[]>([])
  const [carryoverLoading, setCarryoverLoading] = useState(false)
  const [carryoverDraft, setCarryoverDraft] = useState<Record<string, string>>({})
  const [carryoverSaving, setCarryoverSaving] = useState<string | null>(null)
  const [carryoverMsg, setCarryoverMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null)

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function createPool() {
    if (!form.name.trim()) return
    setCreating(true); setMsg(null)
    const res = await fetch("/api/admin/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_per_quiniela: isNaN(parseFloat(form.price)) ? 0 : parseFloat(form.price),
        currency: form.currency,
        prize_type: form.prize_type,
        prize_1st: form.prize_type === "physical" ? form.prize_1st.trim() || null : null,
        prize_2nd: form.prize_type === "physical" ? form.prize_2nd.trim() || null : null,
        prize_3rd: form.prize_type === "physical" ? form.prize_3rd.trim() || null : null,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setPools(prev => [...prev, { ...data.pool, member_count: 0, quiniela_count: 0 }])
      setForm({ name: "", description: "", price: "0", currency: "USD", prize_type: "money", ...emptyPhysical })
      setShowCreate(false)
      setMsg({ text: "Liga creada", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al crear", ok: false })
    }
    setCreating(false)
  }

  function startEdit(p: PoolRow) {
    setEditingId(p.id)
    setEditForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price_per_quiniela),
      currency: p.currency,
      is_active: p.is_active,
      prize_type: p.prize_type ?? "money",
      prize_1st: p.prize_1st ?? "",
      prize_2nd: p.prize_2nd ?? "",
      prize_3rd: p.prize_3rd ?? "",
    })
    setMsg(null)
  }

  async function saveEdit(id: string) {
    setEditSaving(true); setMsg(null)
    const res = await fetch("/api/admin/pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        price_per_quiniela: parseFloat(editForm.price) || 0,
        currency: editForm.currency,
        is_active: editForm.is_active,
        prize_type: editForm.prize_type,
        prize_1st: editForm.prize_type === "physical" ? editForm.prize_1st.trim() || null : null,
        prize_2nd: editForm.prize_type === "physical" ? editForm.prize_2nd.trim() || null : null,
        prize_3rd: editForm.prize_type === "physical" ? editForm.prize_3rd.trim() || null : null,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? {
        ...p,
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        price_per_quiniela: parseFloat(editForm.price) || 0,
        currency: editForm.currency,
        is_active: editForm.is_active,
        prize_type: editForm.prize_type,
        prize_1st: editForm.prize_type === "physical" ? editForm.prize_1st.trim() || null : null,
        prize_2nd: editForm.prize_type === "physical" ? editForm.prize_2nd.trim() || null : null,
        prize_3rd: editForm.prize_type === "physical" ? editForm.prize_3rd.trim() || null : null,
      } : p))
      setEditingId(null)
      setMsg({ text: "Liga actualizada", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al guardar", ok: false })
    }
    setEditSaving(false)
  }

  async function toggleKnockoutEditing(id: string, current: boolean) {
    setLoading(id + "knockout")
    const res = await fetch("/api/admin/pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, knockout_editing_open: !current }),
    })
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, knockout_editing_open: !current } : p))
      if (!current) {
        setMsg({ text: "🔓 Edición de eliminatorias habilitada. Cada usuario verá un aviso al entrar a editar su quiniela.", ok: true })
      }
    } else {
      const data = await res.json()
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function toggleActive(id: string, current: boolean) {
    setLoading(id + "toggle")
    const res = await fetch("/api/admin/pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !current }),
    })
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p))
    } else {
      const data = await res.json()
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function deletePool(id: string) {
    setLoading(id + "delete"); setMsg(null)
    const res = await fetch("/api/admin/pools", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (res.ok) {
      setPools(prev => prev.filter(p => p.id !== id))
      setMsg({ text: "Liga eliminada", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null); setConfirmDelete(null)
  }

  // ── Carryover ─────────────────────────────────────────────────────────────

  async function toggleCarryover(id: string, currentAllow: boolean) {
    setLoading(id + "carryover")
    const res = await fetch("/api/admin/pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, allow_carryover_points: !currentAllow }),
    })
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, allow_carryover_points: !currentAllow } : p))
      if (!currentAllow) setMsg({ text: "Carryover habilitado. Configura la fase de inicio y luego ingresa los puntos.", ok: true })
    } else {
      const data = await res.json()
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function saveStartPhase(id: string, phase: string) {
    const res = await fetch("/api/admin/pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, start_phase: phase }),
    })
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, start_phase: phase } : p))
    } else {
      const data = await res.json()
      setMsg({ text: data.error ?? "Error al guardar fase", ok: false })
    }
  }

  async function loadCarryover(poolId: string) {
    if (carryoverPanelId === poolId) { setCarryoverPanelId(null); return }
    setCarryoverLoading(true); setCarryoverMsg(null)
    const res = await fetch(`/api/admin/carryover?pool_id=${poolId}`)
    const data = await res.json()
    if (res.ok) {
      setCarryoverQuinielas(data.quinielas)
      const draft: Record<string, string> = {}
      for (const q of data.quinielas) draft[q.id] = String(q.carryover_points ?? 0)
      setCarryoverDraft(draft)
      setCarryoverPanelId(poolId)
    } else {
      setMsg({ text: data.error ?? "Error al cargar quinielas", ok: false })
    }
    setCarryoverLoading(false)
  }

  async function saveCarryover(quinielaId: string) {
    const val = parseInt(carryoverDraft[quinielaId] ?? "0", 10)
    if (isNaN(val) || val < 0) return
    setCarryoverSaving(quinielaId); setCarryoverMsg(null)
    const res = await fetch("/api/admin/carryover", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiniela_id: quinielaId, carryover_points: val }),
    })
    const data = await res.json()
    if (res.ok) {
      setCarryoverQuinielas(prev => prev.map(q => q.id === quinielaId ? { ...q, carryover_points: val } : q))
      setCarryoverMsg({ id: quinielaId, ok: true, text: "Guardado" })
    } else {
      setCarryoverMsg({ id: quinielaId, ok: false, text: data.error ?? "Error" })
    }
    setCarryoverSaving(null)
  }

  // ── Email export ──────────────────────────────────────────────────────────

  async function loadEmails(poolId: string) {
    if (emailPanelId === poolId) { setEmailPanelId(null); return }
    setEmailLoading(true)
    const res = await fetch(`/api/admin/pool-members?pool_id=${poolId}`)
    const data = await res.json()
    if (res.ok) {
      setEmailMembers(data.members)
      setEmailPanelId(poolId)
    } else {
      setMsg({ text: data.error ?? "Error al cargar emails", ok: false })
    }
    setEmailLoading(false)
  }

  function copyEmails() {
    const text = emailMembers.map(m => m.email).join(", ")
    navigator.clipboard.writeText(text)
  }

  function downloadCsv(poolName: string) {
    const header = "Nombre,Email"
    const rows = emailMembers.map(m => `"${m.name.replace(/"/g, '""')}","${m.email}"`)
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `emails-${poolName.replace(/\s+/g, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Create form ── */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "16px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <button
          onClick={() => { setShowCreate(v => !v); setMsg(null) }}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: showCreate ? "#eff6ff" : "white", border: "none", cursor: "pointer", borderBottom: showCreate ? "1px solid #bfdbfe" : "none" }}
        >
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#2563eb" }}>+ Crear nueva liga</span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{showCreate ? "▲" : "▼"}</span>
        </button>

        {showCreate && (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Name + description */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <label style={lbl}>Nombre *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Amigos del trabajo" style={inp} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={lbl}>Descripción</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional" style={inp} />
              </div>
            </div>

            {/* Prize type */}
            <PrizeTypeToggle
              value={form.prize_type}
              onChange={v => setForm(f => ({ ...f, prize_type: v, ...emptyPhysical }))}
            />

            {/* Physical prizes or price+currency */}
            {form.prize_type === "physical" ? (
              <PhysicalPrizeFields
                prize_1st={form.prize_1st}
                prize_2nd={form.prize_2nd}
                prize_3rd={form.prize_3rd}
                onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
              />
            ) : (
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ width: "140px" }}>
                  <label style={lbl}>Precio por quiniela</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>$</span>
                    <input type="number" min="0" step="0.5" value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))} style={inp} />
                  </div>
                </div>
                <div style={{ width: "100px" }}>
                  <label style={lbl}>Moneda</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={inp}>
                    <option>USD</option><option>MXN</option><option>EUR</option>
                  </select>
                </div>
              </div>
            )}

            {msg && !msg.ok && <p style={{ fontSize: "12px", color: "#dc2626" }}>{msg.text}</p>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createPool} disabled={creating || !form.name.trim()}
                style={{ ...btnPrimary, opacity: creating || !form.name.trim() ? 0.5 : 1 }}>
                {creating ? "Creando..." : "Crear liga"}
              </button>
              <button onClick={() => setShowCreate(false)} style={btnSecondary}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Status message ── */}
      {msg && msg.ok && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, textAlign: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a" }}>
          {msg.text}
        </div>
      )}
      {msg && !msg.ok && !showCreate && emailPanelId === null && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, textAlign: "center", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
          {msg.text}
        </div>
      )}

      {/* ── Pool list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {pools.length === 0 && (
          <p style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "14px" }}>No hay ligas todavía.</p>
        )}

        {pools.map(p => {
          const isLegacy = p.id === LEGACY_POOL_ID
          const pot = p.price_per_quiniela * p.quiniela_count
          const isEditing = editingId === p.id
          const isPhysical = (p.prize_type ?? "money") === "physical"

          const statusStyle: React.CSSProperties = {
            fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px",
            background: p.is_active ? "#dcfce7" : "#f1f5f9",
            color: p.is_active ? "#16a34a" : "#64748b",
          }

          return (
            <div key={p.id} style={{
              background: "white",
              border: `1px solid ${p.is_active ? "#e2e8f0" : "#fecaca"}`,
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}>
              {/* Card header */}
              <div style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>

                  {/* Info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{p.name}</span>
                      {isLegacy && (
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8" }}>
                          Principal
                        </span>
                      )}
                      <span style={statusStyle}>{p.is_active ? "Activo" : "Inactivo"}</span>
                      {p.knockout_editing_open && (
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8" }}>
                          🔓 Elim. abierta
                        </span>
                      )}
                      {p.allow_carryover_points && (
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d" }}>
                          ➕ Carryover
                        </span>
                      )}
                      {isPhysical && (
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#fef3c7", color: "#92400e" }}>
                          🎁 Premio físico
                        </span>
                      )}
                    </div>

                    {p.description && <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 6px" }}>{p.description}</p>}

                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>👥 {p.member_count} miembros</span>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>🎯 {p.quiniela_count} quinielas</span>
                      {isPhysical ? (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {(["🥇", "🥈", "🥉"] as const).map((icon, i) => {
                            const val = [p.prize_1st, p.prize_2nd, p.prize_3rd][i]
                            return val ? (
                              <span key={i} style={{ fontSize: "12px", color: "#92400e", fontWeight: 600 }}>
                                {icon} {val}
                              </span>
                            ) : null
                          })}
                          {!p.prize_1st && !p.prize_2nd && !p.prize_3rd && (
                            <span style={{ fontSize: "12px", color: "#92400e", fontWeight: 600 }}>Premio físico</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                            ${p.price_per_quiniela} {p.currency}/quiniela
                          </span>
                          {p.quiniela_count > 0 && (
                            <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>
                              Pozo: ${pot} {p.currency}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <button onClick={() => isEditing ? setEditingId(null) : startEdit(p)} style={btnSecondary}>
                      {isEditing ? "✕ Cerrar" : "✎ Editar"}
                    </button>
                    <button
                      onClick={() => loadEmails(p.id)}
                      disabled={emailLoading}
                      title="Ver emails de participantes"
                      style={{ ...btnSecondary, borderColor: emailPanelId === p.id ? "#93c5fd" : "#e2e8f0", color: emailPanelId === p.id ? "#1d4ed8" : "#334155", opacity: emailLoading ? 0.5 : 1 }}>
                      {emailLoading && emailPanelId !== p.id ? "..." : emailPanelId === p.id ? "✕ Emails" : "📧 Emails"}
                    </button>
                    {!isLegacy && (
                      <button
                        onClick={() => toggleActive(p.id, p.is_active)}
                        disabled={loading !== null}
                        style={{ ...btnSecondary, borderColor: p.is_active ? "#fca5a5" : "#bbf7d0", color: p.is_active ? "#dc2626" : "#16a34a", opacity: loading !== null ? 0.5 : 1 }}>
                        {loading === p.id + "toggle" ? "..." : p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleKnockoutEditing(p.id, p.knockout_editing_open)}
                      disabled={loading !== null}
                      title={p.knockout_editing_open ? "Cerrar edición de eliminatorias" : "Abrir edición de eliminatorias"}
                      style={{ ...btnSecondary, borderColor: p.knockout_editing_open ? "#93c5fd" : "#e2e8f0", color: p.knockout_editing_open ? "#2563eb" : "#64748b", opacity: loading !== null ? 0.5 : 1 }}>
                      {loading === p.id + "knockout" ? "..." : p.knockout_editing_open ? "🔓 Elim." : "🔒 Elim."}
                    </button>
                    <button
                      onClick={() => toggleCarryover(p.id, p.allow_carryover_points)}
                      disabled={loading !== null}
                      title={p.allow_carryover_points ? "Deshabilitar carryover de R1" : "Habilitar carryover de R1 (liga que empieza en R2+)"}
                      style={{ ...btnSecondary, borderColor: p.allow_carryover_points ? "#86efac" : "#e2e8f0", color: p.allow_carryover_points ? "#15803d" : "#64748b", opacity: loading !== null ? 0.5 : 1 }}>
                      {loading === p.id + "carryover" ? "..." : p.allow_carryover_points ? "➕ Carryover" : "➕ Carryover"}
                    </button>
                    {p.allow_carryover_points && (
                      <button
                        onClick={() => loadCarryover(p.id)}
                        disabled={carryoverLoading}
                        title="Ingresar puntos de rondas anteriores por participante"
                        style={{ ...btnSecondary, borderColor: carryoverPanelId === p.id ? "#86efac" : "#e2e8f0", color: carryoverPanelId === p.id ? "#15803d" : "#334155", opacity: carryoverLoading ? 0.5 : 1 }}>
                        {carryoverLoading && carryoverPanelId !== p.id ? "..." : carryoverPanelId === p.id ? "✕ Puntos R1" : "🏅 Puntos R1"}
                      </button>
                    )}
                    {!isLegacy && (
                      confirmDelete === p.id ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button onClick={() => deletePool(p.id)} disabled={loading !== null}
                            style={{ ...btnDestructiveConfirm, opacity: loading !== null ? 0.5 : 1 }}>
                            {loading === p.id + "delete" ? "..." : "¿Confirmar?"}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} style={btnSecondary}>Cancelar</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          disabled={loading !== null || p.quiniela_count > 0}
                          title={p.quiniela_count > 0 ? "No se puede eliminar una liga con quinielas" : undefined}
                          style={{ ...btnDestructive, opacity: loading !== null || p.quiniela_count > 0 ? 0.4 : 1, cursor: p.quiniela_count > 0 ? "not-allowed" : "pointer" }}>
                          Eliminar
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* ── Email panel ── */}
              {emailPanelId === p.id && (
                <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  {emailLoading ? (
                    <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Cargando miembros...</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>
                          {emailMembers.length} miembro{emailMembers.length !== 1 ? "s" : ""} con email
                        </span>
                        {emailMembers.length > 0 && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={copyEmails} style={btnSecondary}>📋 Copiar emails</button>
                            <button onClick={() => downloadCsv(p.name)} style={btnSecondary}>⬇ CSV</button>
                          </div>
                        )}
                      </div>
                      {emailMembers.length > 0 ? (
                        <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", background: "white" }}>
                          {emailMembers.map((m, i) => (
                            <div key={i} style={{
                              display: "flex", gap: "12px", fontSize: "12px",
                              padding: "6px 12px",
                              borderBottom: i < emailMembers.length - 1 ? "1px solid #f1f5f9" : "none",
                              alignItems: "center",
                            }}>
                              <span style={{ color: "#0f172a", fontWeight: 600, width: "140px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {m.name}
                              </span>
                              <span style={{ color: "#2563eb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {m.email}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>No hay miembros con email registrado.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Carryover config + points panel ── */}
              {p.allow_carryover_points && (
                <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#f0fdf4" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d" }}>Fase de inicio:</span>
                    {START_PHASE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => saveStartPhase(p.id, opt.value)}
                        style={{
                          ...btnSecondary,
                          fontSize: "11px",
                          padding: "4px 10px",
                          background: (p.start_phase || "groups") === opt.value ? "#dcfce7" : "white",
                          borderColor: (p.start_phase || "groups") === opt.value ? "#86efac" : "#e2e8f0",
                          color: (p.start_phase || "groups") === opt.value ? "#15803d" : "#64748b",
                          fontWeight: (p.start_phase || "groups") === opt.value ? 700 : 500,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Carryover points entry panel ── */}
              {carryoverPanelId === p.id && (
                <div style={{ padding: "16px 20px", borderTop: "1px solid #bbf7d0", background: "#f8fafc" }}>
                  <p style={{ fontSize: "12px", color: "#15803d", fontWeight: 700, marginBottom: "10px" }}>
                    Puntos de ronda anterior — ingresa los puntos que cada participante obtuvo antes de unirse a esta liga
                  </p>
                  {carryoverLoading ? (
                    <p style={{ fontSize: "13px", color: "#94a3b8" }}>Cargando...</p>
                  ) : carryoverQuinielas.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#94a3b8" }}>Aún no hay quinielas en esta liga.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {carryoverQuinielas.map(q => {
                        const name = q.profiles?.display_name || q.profiles?.email?.split("@")[0] || "Sin nombre"
                        const fb = carryoverMsg?.id === q.id
                        return (
                          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "12px", color: "#334155", width: "160px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {name}
                            </span>
                            <span style={{ fontSize: "11px", color: "#94a3b8", width: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {q.name}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={carryoverDraft[q.id] ?? "0"}
                              onChange={e => setCarryoverDraft(d => ({ ...d, [q.id]: e.target.value }))}
                              style={{ ...inp, width: "80px" }}
                            />
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>pts</span>
                            <button
                              onClick={() => saveCarryover(q.id)}
                              disabled={carryoverSaving === q.id}
                              style={{ ...btnSecondary, fontSize: "11px", padding: "4px 10px", borderColor: "#86efac", color: "#15803d", opacity: carryoverSaving === q.id ? 0.5 : 1 }}>
                              {carryoverSaving === q.id ? "..." : "Guardar"}
                            </button>
                            {fb && (
                              <span style={{ fontSize: "11px", color: fb && carryoverMsg?.ok ? "#15803d" : "#dc2626" }}>
                                {carryoverMsg?.text}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Inline edit form ── */}
              {isEditing && (
                <div style={{ padding: "18px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Name + description */}
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={lbl}>Nombre *</label>
                      <input type="text" value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                    </div>
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={lbl}>Descripción</label>
                      <input type="text" value={editForm.description} placeholder="Opcional"
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={inp} />
                    </div>
                  </div>

                  {/* Prize type */}
                  <PrizeTypeToggle
                    value={editForm.prize_type}
                    onChange={v => setEditForm(f => ({ ...f, prize_type: v, ...emptyPhysical }))}
                  />

                  {/* Physical prizes or price+currency+estado */}
                  {editForm.prize_type === "physical" ? (
                    <>
                      <PhysicalPrizeFields
                        prize_1st={editForm.prize_1st}
                        prize_2nd={editForm.prize_2nd}
                        prize_3rd={editForm.prize_3rd}
                        onChange={(field, value) => setEditForm(f => ({ ...f, [field]: value }))}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label style={{ ...lbl, margin: 0 }}>Estado:</label>
                        <button type="button"
                          onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                          style={{ ...btnSecondary, borderColor: editForm.is_active ? "#bbf7d0" : "#fca5a5", color: editForm.is_active ? "#16a34a" : "#dc2626" }}>
                          {editForm.is_active ? "Activo" : "Inactivo"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ width: "140px" }}>
                        <label style={lbl}>Precio por quiniela</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", color: "#64748b" }}>$</span>
                          <input type="number" min="0" step="0.5" value={editForm.price}
                            onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} style={inp} />
                        </div>
                      </div>
                      <div style={{ width: "100px" }}>
                        <label style={lbl}>Moneda</label>
                        <select value={editForm.currency}
                          onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))} style={inp}>
                          <option>USD</option><option>MXN</option><option>EUR</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label style={{ ...lbl, margin: 0 }}>Estado:</label>
                        <button type="button"
                          onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                          style={{ ...btnSecondary, borderColor: editForm.is_active ? "#bbf7d0" : "#fca5a5", color: editForm.is_active ? "#16a34a" : "#dc2626" }}>
                          {editForm.is_active ? "Activo" : "Inactivo"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => saveEdit(p.id)} disabled={editSaving || !editForm.name.trim()}
                      style={{ ...btnPrimary, opacity: editSaving || !editForm.name.trim() ? 0.5 : 1 }}>
                      {editSaving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button onClick={() => setEditingId(null)} style={btnSecondary}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
