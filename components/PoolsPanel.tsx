"use client"

import { useState } from "react"

interface PoolRow {
  id: string
  name: string
  description: string | null
  price_per_quiniela: number
  currency: string
  is_active: boolean
  created_at: string
  member_count: number
  quiniela_count: number
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

// ─────────────────────────────────────────────────────────────────────────────

export default function PoolsPanel({ pools: initialPools }: { pools: PoolRow[] }) {
  const [pools, setPools] = useState(initialPools)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "5", currency: "USD", is_active: true })
  const [editSaving, setEditSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", price: "5", currency: "USD" })
  const [creating, setCreating] = useState(false)

  async function createPool() {
    if (!form.name.trim()) return
    setCreating(true); setMsg(null)
    const res = await fetch("/api/admin/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_per_quiniela: parseFloat(form.price) || 5,
        currency: form.currency,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setPools(prev => [...prev, { ...data.pool, member_count: 0, quiniela_count: 0 }])
      setForm({ name: "", description: "", price: "5", currency: "USD" })
      setShowCreate(false)
      setMsg({ text: "Liga creada", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al crear", ok: false })
    }
    setCreating(false)
  }

  function startEdit(p: PoolRow) {
    setEditingId(p.id)
    setEditForm({ name: p.name, description: p.description ?? "", price: String(p.price_per_quiniela), currency: p.currency, is_active: p.is_active })
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
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setPools(prev => prev.map(p => p.id === id ? { ...p, ...data.pool } : p))
      setEditingId(null)
      setMsg({ text: "Liga actualizada", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al guardar", ok: false })
    }
    setEditSaving(false)
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
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
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
      {msg && !msg.ok && !showCreate && (
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
                    </div>
                    {p.description && <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 6px" }}>{p.description}</p>}
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>👥 {p.member_count} miembros</span>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>🎯 {p.quiniela_count} quinielas</span>
                      <span style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                        ${p.price_per_quiniela} {p.currency}/quiniela
                      </span>
                      {p.quiniela_count > 0 && (
                        <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>
                          Pozo: ${pot} {p.currency}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    <button onClick={() => isEditing ? setEditingId(null) : startEdit(p)} style={btnSecondary}>
                      {isEditing ? "✕ Cerrar" : "✎ Editar"}
                    </button>
                    {!isLegacy && (
                      <button
                        onClick={() => toggleActive(p.id, p.is_active)}
                        disabled={loading !== null}
                        style={{ ...btnSecondary, borderColor: p.is_active ? "#fca5a5" : "#bbf7d0", color: p.is_active ? "#dc2626" : "#16a34a", opacity: loading !== null ? 0.5 : 1 }}>
                        {loading === p.id + "toggle" ? "..." : p.is_active ? "Desactivar" : "Activar"}
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

              {/* Inline edit form */}
              {isEditing && (
                <div style={{ padding: "18px 20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "12px" }}>
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
