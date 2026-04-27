"use client"

import { useState } from "react"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

interface Pool { id: string; name: string }

interface InviteCode {
  id: string
  code: string
  description: string | null
  is_active: boolean
  max_uses: number | null
  uses_count: number
  auto_approve: boolean
  created_at: string
  pool_id: string | null
  pools: { id: string; name: string } | null
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  background: "white",
  color: "#0f172a",
  fontSize: "14px",
  boxSizing: "border-box",
}

const label: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#475569",
  marginBottom: "4px",
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
}

const btnPrimary: React.CSSProperties = {
  padding: "9px 24px",
  borderRadius: "10px",
  background: "#2563eb",
  color: "white",
  fontWeight: 700,
  fontSize: "14px",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
}

const btnSecondary: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "8px",
  background: "white",
  border: "1px solid #e2e8f0",
  color: "#334155",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
}

const btnDestructive: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "8px",
  background: "white",
  border: "1px solid #fca5a5",
  color: "#dc2626",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
}

const btnDestructiveConfirm: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "8px",
  background: "#dc2626",
  border: "none",
  color: "white",
  fontWeight: 700,
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
}

export default function InviteCodesPanel({
  codes: initialCodes,
  pools,
}: {
  codes: InviteCode[]
  pools: Pool[]
}) {
  const [codes, setCodes] = useState(initialCodes)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // New code form
  const [newCode, setNewCode] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newMaxUses, setNewMaxUses] = useState("")
  const [newAutoApprove, setNewAutoApprove] = useState(true)
  const [newPoolId, setNewPoolId] = useState(LEGACY_POOL_ID)
  const [creating, setCreating] = useState(false)

  async function createCode() {
    if (!newCode.trim()) return
    setCreating(true)
    setMsg(null)
    const res = await fetch("/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newCode.trim(),
        description: newDesc.trim() || null,
        max_uses: newMaxUses ? parseInt(newMaxUses) : null,
        auto_approve: newAutoApprove,
        pool_id: newPoolId,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      const pool = pools.find(p => p.id === newPoolId) ?? null
      setCodes(prev => [{ ...data.code, pools: pool ? { id: pool.id, name: pool.name } : null }, ...prev])
      setNewCode(""); setNewDesc(""); setNewMaxUses("")
      setMsg({ text: "Código creado", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al crear", ok: false })
    }
    setCreating(false)
  }

  async function toggleActive(id: string, current: boolean) {
    setLoading(id + "active")
    const res = await fetch("/api/admin/invite-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !current }),
    })
    if (res.ok) {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c))
    } else {
      const data = await res.json()
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function patchCode(id: string, update: Partial<InviteCode>) {
    setLoading(id + "patch")
    const res = await fetch("/api/admin/invite-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...update }),
    })
    const data = await res.json()
    if (res.ok) {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, ...update } : c))
      setMsg({ text: "Actualizado", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function deleteCode(id: string) {
    setLoading(id + "delete")
    setMsg(null)
    const res = await fetch("/api/admin/invite-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (res.ok) {
      setCodes(prev => prev.filter(c => c.id !== id))
      setMsg({ text: "Código eliminado", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
    setConfirmDelete(null)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Create form ── */}
      <div style={{ ...card, border: "1px solid #bfdbfe", background: "#eff6ff" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e40af", margin: "0 0 16px" }}>
          Crear Nuevo Código
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Código *</label>
              <input
                type="text"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                placeholder="ej. AMIGOS2026"
                style={{ ...input, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em" }}
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Descripción</label>
              <input
                type="text"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Para la liga de amigos"
                style={input}
              />
            </div>
            <div style={{ width: "100px", flexShrink: 0 }}>
              <label style={label}>Usos máx.</label>
              <input
                type="number"
                min="1"
                value={newMaxUses}
                onChange={e => setNewMaxUses(e.target.value)}
                placeholder="∞"
                style={input}
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Liga</label>
              <select
                value={newPoolId}
                onChange={e => setNewPoolId(e.target.value)}
                style={input}
              >
                {pools.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <div
                onClick={() => setNewAutoApprove(v => !v)}
                style={{
                  width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: newAutoApprove ? "2px solid #2563eb" : "2px solid #cbd5e1",
                  background: newAutoApprove ? "#2563eb" : "white",
                  cursor: "pointer",
                }}
              >
                {newAutoApprove && (
                  <svg width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: "13px", color: "#334155" }}>Auto-aprobar usuarios al registrarse con este código</span>
            </label>
            <button
              onClick={createCode}
              disabled={creating || !newCode.trim()}
              style={{ ...btnPrimary, opacity: creating || !newCode.trim() ? 0.5 : 1 }}
            >
              {creating ? "Creando..." : "+ Crear Código"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Status message ── */}
      {msg && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 500,
          textAlign: "center",
          background: msg.ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`,
          color: msg.ok ? "#16a34a" : "#dc2626",
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Codes list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {codes.length === 0 && (
          <p style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "14px" }}>
            No hay códigos. Crea uno arriba.
          </p>
        )}

        {codes.map(c => {
          const usageLabel = c.max_uses ? `${c.uses_count} / ${c.max_uses} usos` : `${c.uses_count} usos`
          const pct = c.max_uses ? Math.min(100, Math.round((c.uses_count / c.max_uses) * 100)) : null
          const isExhausted = c.max_uses !== null && c.uses_count >= c.max_uses
          const isActive = c.is_active && !isExhausted

          const statusStyle: React.CSSProperties = {
            fontSize: "11px",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: "999px",
            background: isExhausted ? "#fee2e2" : isActive ? "#dcfce7" : "#f1f5f9",
            color: isExhausted ? "#dc2626" : isActive ? "#16a34a" : "#64748b",
          }

          return (
            <div key={c.id} style={{
              ...card,
              borderColor: isExhausted ? "#fecaca" : isActive ? "#bbf7d0" : "#e2e8f0",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>

                {/* Info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "15px", color: "#0f172a", letterSpacing: "0.05em" }}>
                      {c.code}
                    </span>
                    <span style={statusStyle}>
                      {isExhausted ? "Agotado" : isActive ? "Activo" : "Inactivo"}
                    </span>
                    {c.auto_approve && (
                      <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>⚡ Auto-aprueba</span>
                    )}
                  </div>

                  {c.description && (
                    <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 3px" }}>{c.description}</p>
                  )}

                  {c.pools && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 6px" }}>
                      Liga: <span style={{ color: "#334155", fontWeight: 600 }}>{c.pools.name}</span>
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{usageLabel}</span>
                    {pct !== null && (
                      <div style={{ width: "64px", height: "5px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: "999px", width: `${pct}%`, background: pct >= 100 ? "#dc2626" : "#2563eb" }} />
                      </div>
                    )}
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {new Date(c.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={() => toggleActive(c.id, c.is_active)}
                    disabled={loading !== null}
                    style={{
                      ...btnSecondary,
                      borderColor: c.is_active ? "#fca5a5" : "#bbf7d0",
                      color: c.is_active ? "#dc2626" : "#16a34a",
                      opacity: loading !== null ? 0.5 : 1,
                    }}
                  >
                    {loading === c.id + "active" ? "..." : c.is_active ? "Desactivar" : "Activar"}
                  </button>

                  <button
                    onClick={() => patchCode(c.id, { auto_approve: !c.auto_approve })}
                    disabled={loading !== null}
                    style={{ ...btnSecondary, opacity: loading !== null ? 0.5 : 1 }}
                  >
                    {loading === c.id + "patch" ? "..." : c.auto_approve ? "Quitar auto-aprobación" : "Activar auto-aprobación"}
                  </button>

                  {confirmDelete === c.id ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => deleteCode(c.id)}
                        disabled={loading !== null}
                        style={{ ...btnDestructiveConfirm, opacity: loading !== null ? 0.5 : 1 }}
                      >
                        {loading === c.id + "delete" ? "..." : "¿Confirmar?"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={btnSecondary}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      disabled={loading !== null || c.uses_count > 0}
                      title={c.uses_count > 0 ? "No se puede eliminar un código con usos" : undefined}
                      style={{ ...btnDestructive, opacity: loading !== null || c.uses_count > 0 ? 0.4 : 1, cursor: c.uses_count > 0 ? "not-allowed" : "pointer" }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
