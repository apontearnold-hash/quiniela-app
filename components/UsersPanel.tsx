"use client"

import { useState } from "react"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

interface UserRow {
  id: string
  email: string | null
  display_name: string | null
  status: string
  invite_code_used: string | null
  is_test_user: boolean
  provider: string | null
  created_at: string
  quiniela_count: number
}

interface Pool { id: string; name: string }

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: "8px",
  border: "1px solid #e2e8f0", background: "white", color: "#0f172a",
  fontSize: "13px", boxSizing: "border-box",
}
const btnPrimary: React.CSSProperties = { padding: "7px 16px", borderRadius: "8px", background: "#2563eb", color: "white", fontWeight: 700, fontSize: "12px", border: "none", cursor: "pointer" }
const btnSuccess: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "#16a34a", color: "white", fontWeight: 700, fontSize: "12px", border: "none", cursor: "pointer" }
const btnSecondary: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "white", border: "1px solid #e2e8f0", color: "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }
const btnDestructive: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "white", border: "1px solid #fca5a5", color: "#dc2626", fontWeight: 600, fontSize: "12px", cursor: "pointer" }
const btnDestructiveConfirm: React.CSSProperties = { padding: "6px 12px", borderRadius: "8px", background: "#dc2626", border: "none", color: "white", fontWeight: 700, fontSize: "12px", cursor: "pointer" }

const STATUS_BG: Record<string, string>   = { approved: "#dcfce7", pending: "#fef9c3", blocked: "#fee2e2" }
const STATUS_COLOR: Record<string, string> = { approved: "#16a34a", pending: "#854d0e", blocked: "#dc2626" }
const STATUS_LABELS: Record<string, string> = { approved: "✓ Aprobado", pending: "⏳ Pendiente", blocked: "🚫 Bloqueado" }

// ─────────────────────────────────────────────────────────────────────────────

export default function UsersPanel({
  users: initialUsers,
  currentAdminEmail,
  pools,
  poolMemberships: initialMemberships,
}: {
  users: UserRow[]
  currentAdminEmail: string
  pools: Pool[]
  poolMemberships: Record<string, { pool_id: string; name: string }[]>
}) {
  const [users, setUsers] = useState(initialUsers)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "blocked">("all")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [memberships, setMemberships] = useState(initialMemberships)

  // Create test user form
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ display_name: "", email: "", password: "", pool_id: LEGACY_POOL_ID })
  const [createLoading, setCreateLoading] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Pool assignment per user
  const [addPoolFor, setAddPoolFor] = useState<string | null>(null)
  const [addPoolId, setAddPoolId] = useState("")

  async function createTestUser() {
    setCreateLoading(true)
    setCreateMsg(null)
    const res = await fetch("/api/admin/users/create-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    })
    const data = await res.json()
    if (res.ok) {
      const newUser: UserRow = {
        id: data.user.id,
        email: data.user.email,
        display_name: data.user.display_name,
        status: "approved",
        is_test_user: true,
        invite_code_used: null,
        provider: "email",
        created_at: new Date().toISOString(),
        quiniela_count: 0,
      }
      setUsers(prev => [newUser, ...prev])
      const selectedPool = pools.find(p => p.id === createForm.pool_id)
      const generalPool = pools.find(p => p.id === LEGACY_POOL_ID)
      const newMemberships: { pool_id: string; name: string }[] = []
      if (generalPool) newMemberships.push({ pool_id: LEGACY_POOL_ID, name: generalPool.name })
      if (selectedPool && selectedPool.id !== LEGACY_POOL_ID) newMemberships.push({ pool_id: selectedPool.id, name: selectedPool.name })
      setMemberships(prev => ({ ...prev, [data.user.id]: newMemberships }))
      setCreateForm({ display_name: "", email: "", password: "", pool_id: LEGACY_POOL_ID })
      setShowCreate(false)
      setMsg({ text: `Usuario de prueba creado: ${data.user.email}`, ok: true })
    } else {
      setCreateMsg({ text: data.error ?? "Error al crear usuario", ok: false })
    }
    setCreateLoading(false)
  }

  async function addToPool(userId: string, poolId: string) {
    setLoading(userId + "addpool")
    const res = await fetch("/api/admin/pool-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, pool_id: poolId }),
    })
    if (res.ok) {
      const pool = pools.find(p => p.id === poolId)
      if (pool) {
        setMemberships(prev => {
          const existing = prev[userId] ?? []
          if (existing.some(m => m.pool_id === poolId)) return prev
          return { ...prev, [userId]: [...existing, { pool_id: poolId, name: pool.name }] }
        })
      }
    } else {
      const d = await res.json()
      setMsg({ text: d.error ?? "Error al agregar", ok: false })
    }
    setLoading(null)
    setAddPoolFor(null)
    setAddPoolId("")
  }

  async function removeFromPool(userId: string, poolId: string) {
    setLoading(userId + "removepool" + poolId)
    const res = await fetch("/api/admin/pool-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, pool_id: poolId }),
    })
    if (res.ok) {
      setMemberships(prev => ({
        ...prev,
        [userId]: (prev[userId] ?? []).filter(m => m.pool_id !== poolId),
      }))
    } else {
      const d = await res.json()
      setMsg({ text: d.error ?? "Error al remover", ok: false })
    }
    setLoading(null)
  }

  const filtered = filter === "all" ? users : users.filter(u => u.status === filter)

  async function updateStatus(userId: string, status: string) {
    setLoading(userId + status)
    setMsg(null)
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, status }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u))
      setMsg({ text: "Estado actualizado", ok: true })
    } else {
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function toggleTestUser(userId: string, current: boolean) {
    setLoading(userId + "test")
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, is_test_user: !current }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_test_user: !current } : u))
    } else {
      setMsg({ text: data.error ?? "Error", ok: false })
    }
    setLoading(null)
  }

  async function deleteUser(userId: string, force: boolean) {
    setLoading(userId + "delete")
    setMsg(null)
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, force }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== userId))
      setMsg({ text: `Usuario eliminado (${data.deleted_quinielas ?? 0} quinielas borradas)`, ok: true })
    } else {
      setMsg({ text: data.error ?? "Error al eliminar", ok: false })
    }
    setLoading(null)
    setConfirmDelete(null)
  }

  const counts = {
    all: users.length,
    pending: users.filter(u => u.status === "pending").length,
    approved: users.filter(u => u.status === "approved").length,
    blocked: users.filter(u => u.status === "blocked").length,
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Create test user ── */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "16px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateMsg(null) }}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: showCreate ? "#eff6ff" : "white", border: "none", cursor: "pointer", borderBottom: showCreate ? "1px solid #bfdbfe" : "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#2563eb" }}>+ Crear usuario de prueba</span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>{showCreate ? "▲" : "▼"}</span>
        </button>

        {showCreate && (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
              El usuario se crea sin verificación de email, marcado como test, aprobado inmediatamente.
            </p>
            <input type="text" placeholder="Nombre completo"
              value={createForm.display_name}
              onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
              style={inp} />
            <input type="email" placeholder="Email"
              value={createForm.email}
              onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
              style={inp} />
            <input type="password" placeholder="Contraseña (mínimo 6 caracteres)"
              value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              style={inp} />
            {pools.length > 1 && (
              <select value={createForm.pool_id}
                onChange={e => setCreateForm(f => ({ ...f, pool_id: e.target.value }))}
                style={inp}>
                {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {createMsg && (
              <p style={{ fontSize: "12px", color: createMsg.ok ? "#16a34a" : "#dc2626", margin: 0 }}>{createMsg.text}</p>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createTestUser}
                disabled={createLoading || !createForm.email || !createForm.password}
                style={{ ...btnPrimary, opacity: createLoading || !createForm.email || !createForm.password ? 0.5 : 1 }}>
                {createLoading ? "Creando..." : "Crear usuario de prueba"}
              </button>
              <button onClick={() => setShowCreate(false)} style={btnSecondary}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {(["all", "pending", "approved", "blocked"] as const).map(f => {
          const active = filter === f
          const accentBg: Record<string, string> = { all: "#2563eb", pending: "#ca8a04", approved: "#16a34a", blocked: "#dc2626" }
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                background: active ? accentBg[f] : "white",
                color: active ? "white" : "#64748b",
                border: active ? `1px solid ${accentBg[f]}` : "1px solid #e2e8f0",
              }}>
              {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "approved" ? "Aprobados" : "Bloqueados"}
              <span style={{ marginLeft: "5px", opacity: 0.75 }}>({counts[f]})</span>
            </button>
          )
        })}
      </div>

      {/* ── Global message ── */}
      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, textAlign: "center", background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, color: msg.ok ? "#16a34a" : "#dc2626" }}>
          {msg.text}
        </div>
      )}

      {/* ── User list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "14px" }}>No hay usuarios en esta categoría</p>
        )}

        {filtered.map(u => {
          const isCurrentAdmin = u.email === currentAdminEmail
          const isLoading = (key: string) => loading === u.id + key
          const statusBg = STATUS_BG[u.status] ?? "#f1f5f9"
          const statusColor = STATUS_COLOR[u.status] ?? "#64748b"

          return (
            <div key={u.id} style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "16px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>

                {/* User info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "3px" }}>
                    <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                      {u.display_name || u.email?.split("@")[0] || "—"}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: statusBg, color: statusColor }}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                    {u.is_test_user && (
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#64748b" }}>
                        TEST
                      </span>
                    )}
                    {isCurrentAdmin && (
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8" }}>
                        ADMIN
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 5px" }}>{u.email}</p>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {u.provider === "google" ? "🌐 Google" : "✉️ Email"}
                    </span>
                    {u.invite_code_used && (
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>🔑 {u.invite_code_used}</span>
                    )}
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      🎯 {u.quiniela_count} quiniela{u.quiniela_count !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {new Date(u.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  {/* Pool membership chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    {u.status === "approved" && (memberships[u.id] ?? []).length === 0 && (
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "3px 10px",
                        borderRadius: "999px", background: "#fff7ed",
                        color: "#c2410c", border: "1px solid #fed7aa",
                      }}>
                        ⚠ Sin liga
                      </span>
                    )}
                    {(memberships[u.id] ?? []).map(m => (
                      <span key={m.pool_id} style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                        background: m.pool_id === LEGACY_POOL_ID ? "#dbeafe" : "#f1f5f9",
                        color: m.pool_id === LEGACY_POOL_ID ? "#1d4ed8" : "#334155",
                        border: "1px solid #e2e8f0",
                      }}>
                        {m.name}
                        {m.pool_id !== LEGACY_POOL_ID && !isCurrentAdmin && (
                          <button onClick={() => removeFromPool(u.id, m.pool_id)}
                            disabled={loading !== null}
                            style={{ background: "none", border: "none", padding: "0", cursor: "pointer", color: "#94a3b8", fontSize: "13px", lineHeight: 1, marginLeft: "2px" }}>
                            ×
                          </button>
                        )}
                      </span>
                    ))}

                    {addPoolFor === u.id ? (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <select value={addPoolId} onChange={e => setAddPoolId(e.target.value)}
                          style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "white", color: "#0f172a", fontSize: "12px" }}>
                          <option value="">Seleccionar liga...</option>
                          {pools
                            .filter(p => !(memberships[u.id] ?? []).some(m => m.pool_id === p.id))
                            .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button onClick={() => addPoolId && addToPool(u.id, addPoolId)}
                          disabled={!addPoolId || loading !== null}
                          style={{ ...btnSuccess, padding: "4px 10px", opacity: !addPoolId || loading !== null ? 0.5 : 1 }}>
                          +
                        </button>
                        <button onClick={() => { setAddPoolFor(null); setAddPoolId("") }}
                          style={{ ...btnSecondary, padding: "4px 8px" }}>✕</button>
                      </div>
                    ) : (
                      !isCurrentAdmin && pools.filter(p => !(memberships[u.id] ?? []).some(m => m.pool_id === p.id)).length > 0 && (
                        <button onClick={() => { setAddPoolFor(u.id); setAddPoolId("") }}
                          style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "white", border: "1px dashed #cbd5e1", color: "#94a3b8", cursor: "pointer" }}>
                          + liga
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!isCurrentAdmin && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-start" }}>
                    {u.status !== "approved" && (
                      <button onClick={() => updateStatus(u.id, "approved")} disabled={loading !== null}
                        style={{ ...btnSuccess, opacity: loading !== null ? 0.5 : 1 }}>
                        {isLoading("approved") ? "..." : "Aprobar"}
                      </button>
                    )}
                    {u.status !== "blocked" && (
                      <button onClick={() => updateStatus(u.id, "blocked")} disabled={loading !== null}
                        style={{ ...btnDestructive, opacity: loading !== null ? 0.5 : 1 }}>
                        {isLoading("blocked") ? "..." : "Bloquear"}
                      </button>
                    )}
                    {u.status === "blocked" && (
                      <button onClick={() => updateStatus(u.id, "approved")} disabled={loading !== null}
                        style={{ ...btnSuccess, opacity: loading !== null ? 0.5 : 1 }}>
                        {isLoading("approved") ? "..." : "Desbloquear"}
                      </button>
                    )}
                    <button onClick={() => toggleTestUser(u.id, u.is_test_user)} disabled={loading !== null}
                      style={{ ...btnSecondary, opacity: loading !== null ? 0.5 : 1, borderColor: u.is_test_user ? "#e2e8f0" : "#e2e8f0" }}>
                      {isLoading("test") ? "..." : u.is_test_user ? "Quitar test" : "Marcar test"}
                    </button>

                    {confirmDelete === u.id ? (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => deleteUser(u.id, true)} disabled={loading !== null}
                          style={{ ...btnDestructiveConfirm, opacity: loading !== null ? 0.5 : 1 }}>
                          {isLoading("delete") ? "..." : "¿Confirmar?"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={btnSecondary}>Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(u.id)} disabled={loading !== null}
                        style={{ ...btnDestructive, opacity: loading !== null ? 0.5 : 1 }}>
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
