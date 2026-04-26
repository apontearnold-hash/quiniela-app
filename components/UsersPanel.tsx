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

const STATUS_COLORS: Record<string, string> = {
  approved: "text-green-400",
  pending:  "text-yellow-400",
  blocked:  "text-red-400",
}

const STATUS_LABELS: Record<string, string> = {
  approved: "✓ Aprobado",
  pending:  "⏳ Pendiente",
  blocked:  "🚫 Bloqueado",
}

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
      // Set initial pool memberships for new user
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
    <div className="flex flex-col gap-4">
      {/* Create test user */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2a5438" }}>
        <button
          onClick={() => { setShowCreate(v => !v); setCreateMsg(null) }}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-[#7ab88a] hover:text-white transition-colors"
          style={{ background: "linear-gradient(135deg, #0a1208, #111a0f)" }}>
          <span>+ Crear usuario de prueba</span>
          <span className="text-xs opacity-60">{showCreate ? "▲" : "▼"}</span>
        </button>
        {showCreate && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-3" style={{ background: "#0a1208" }}>
            <p className="text-xs text-[#4a7a5a]">El usuario se crea sin verificación de email, marcado como test, aprobado inmediatamente.</p>
            <input
              type="text" placeholder="Nombre completo"
              value={createForm.display_name}
              onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]"
            />
            <input
              type="email" placeholder="Email"
              value={createForm.email}
              onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]"
            />
            <input
              type="password" placeholder="Contraseña (mínimo 6 caracteres)"
              value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm text-white bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]"
            />
            {pools.length > 1 && (
              <select
                value={createForm.pool_id}
                onChange={e => setCreateForm(f => ({ ...f, pool_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm text-white bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none">
                {pools.map(p => <option key={p.id} value={p.id} className="bg-[#0a1208]">{p.name}</option>)}
              </select>
            )}
            {createMsg && (
              <p className={`text-xs ${createMsg.ok ? "text-green-400" : "text-red-400"}`}>{createMsg.text}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={createTestUser}
                disabled={createLoading || !createForm.email || !createForm.password}
                className="px-4 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                {createLoading ? "Creando..." : "Crear usuario de prueba"}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "approved", "blocked"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f ? "bg-[#F5C518] text-black" : "border border-[#2a5438] text-[#7ab88a] hover:border-[#F5C518]"}`}>
            {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "approved" ? "Aprobados" : "Bloqueados"}
            <span className="ml-1 opacity-70">({counts[f]})</span>
          </button>
        ))}
      </div>

      {msg && (
        <div className={`p-2 rounded-lg text-xs text-center ${msg.ok ? "text-green-400" : "text-red-400"}`}
          style={{ background: "rgba(10,18,8,0.5)", border: "1px solid #2a5438" }}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <p className="text-[#4a7a5a] text-sm text-center py-8">No hay usuarios en esta categoría</p>
        )}
        {filtered.map(u => {
          const isCurrentAdmin = u.email === currentAdminEmail
          const isLoading = (key: string) => loading === u.id + key
          return (
            <div key={u.id} className="rounded-xl p-4"
              style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)", border: "1px solid #2a5438" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* User info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">
                      {u.display_name || u.email?.split("@")[0] || "—"}
                    </span>
                    <span className={`text-xs font-bold ${STATUS_COLORS[u.status] ?? "text-[#7ab88a]"}`}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                    {u.is_test_user && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold text-black"
                        style={{ background: "#888" }}>TEST</span>
                    )}
                    {isCurrentAdmin && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold text-black"
                        style={{ background: "#F5C518" }}>ADMIN</span>
                    )}
                  </div>
                  <p className="text-[#7ab88a] text-xs mt-0.5">{u.email}</p>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    <span className="text-[#4a7a5a] text-xs">
                      {u.provider === "google" ? "🌐 Google" : "✉️ Email"}
                    </span>
                    {u.invite_code_used && (
                      <span className="text-[#4a7a5a] text-xs">
                        🔑 {u.invite_code_used}
                      </span>
                    )}
                    <span className="text-[#4a7a5a] text-xs">
                      🎯 {u.quiniela_count} quiniela{u.quiniela_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[#4a7a5a] text-xs">
                      {new Date(u.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  {/* Pool memberships */}
                  <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                    {(memberships[u.id] ?? []).map(m => (
                      <span key={m.pool_id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{ background: m.pool_id === LEGACY_POOL_ID ? "rgba(245,197,24,0.15)" : "rgba(42,84,56,0.6)", border: "1px solid #2a5438" }}>
                        <span className="text-[#7ab88a]">{m.name}</span>
                        {m.pool_id !== LEGACY_POOL_ID && !isCurrentAdmin && (
                          <button onClick={() => removeFromPool(u.id, m.pool_id)}
                            disabled={loading !== null}
                            className="text-[#4a7a5a] hover:text-red-400 leading-none ml-0.5">
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {addPoolFor === u.id ? (
                      <div className="flex gap-1 items-center">
                        <select value={addPoolId} onChange={e => setAddPoolId(e.target.value)}
                          className="px-2 py-0.5 rounded-lg text-xs text-white bg-[#0a1208] border border-[#2a5438] outline-none">
                          <option value="" className="bg-[#0a1208]">Seleccionar liga...</option>
                          {pools
                            .filter(p => !(memberships[u.id] ?? []).some(m => m.pool_id === p.id))
                            .map(p => <option key={p.id} value={p.id} className="bg-[#0a1208]">{p.name}</option>)}
                        </select>
                        <button onClick={() => addPoolId && addToPool(u.id, addPoolId)}
                          disabled={!addPoolId || loading !== null}
                          className="px-2 py-0.5 rounded-lg text-xs font-bold text-black disabled:opacity-40"
                          style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                          +
                        </button>
                        <button onClick={() => { setAddPoolFor(null); setAddPoolId("") }}
                          className="px-2 py-0.5 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">
                          ✕
                        </button>
                      </div>
                    ) : (
                      !isCurrentAdmin && pools.filter(p => !(memberships[u.id] ?? []).some(m => m.pool_id === p.id)).length > 0 && (
                        <button onClick={() => { setAddPoolFor(u.id); setAddPoolId("") }}
                          className="px-2 py-0.5 rounded-full text-xs text-[#4a7a5a] border border-dashed border-[#2a5438] hover:border-[#F5C518] hover:text-[#F5C518]">
                          + liga
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!isCurrentAdmin && (
                  <div className="flex flex-wrap gap-2">
                    {u.status !== "approved" && (
                      <button onClick={() => updateStatus(u.id, "approved")} disabled={loading !== null}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                        {isLoading("approved") ? "..." : "Aprobar"}
                      </button>
                    )}
                    {u.status !== "blocked" && (
                      <button onClick={() => updateStatus(u.id, "blocked")} disabled={loading !== null}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                        style={{ background: "#7a1a1a" }}>
                        {isLoading("blocked") ? "..." : "Bloquear"}
                      </button>
                    )}
                    {u.status === "blocked" && (
                      <button onClick={() => updateStatus(u.id, "approved")} disabled={loading !== null}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                        {isLoading("approved") ? "..." : "Desbloquear"}
                      </button>
                    )}
                    <button onClick={() => toggleTestUser(u.id, u.is_test_user)} disabled={loading !== null}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold disabled:opacity-50 border ${u.is_test_user ? "text-white border-[#2a5438]" : "text-[#7ab88a] border-[#2a5438] hover:border-[#F5C518]"}`}>
                      {isLoading("test") ? "..." : u.is_test_user ? "Quitar test" : "Marcar test"}
                    </button>
                    {confirmDelete === u.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteUser(u.id, true)} disabled={loading !== null}
                          className="py-1.5 px-3 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: "#991b1b" }}>
                          {isLoading("delete") ? "..." : "¿Confirmar?"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="py-1.5 px-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(u.id)} disabled={loading !== null}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-red-400 border border-[#2a5438] hover:border-red-700 disabled:opacity-50">
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
