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
    <div className="flex flex-col gap-5">
      {/* Create form */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2a5438" }}>
        <button
          onClick={() => { setShowCreate(v => !v); setMsg(null) }}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-[#7ab88a] hover:text-white transition-colors"
          style={{ background: "linear-gradient(135deg, #0a1208, #111a0f)" }}>
          <span>+ Crear nueva liga</span>
          <span className="text-xs opacity-60">{showCreate ? "▲" : "▼"}</span>
        </button>
        {showCreate && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-3" style={{ background: "#0a1208" }}>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-40">
                <label className="block text-[#7ab88a] text-xs mb-1">Nombre *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Amigos del trabajo"
                  className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-[#7ab88a] text-xs mb-1">Descripción</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="w-32">
                <label className="block text-[#7ab88a] text-xs mb-1">Precio por quiniela</label>
                <div className="flex items-center gap-1">
                  <span className="text-[#7ab88a] text-xs">$</span>
                  <input type="number" min="0" step="0.5" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
                </div>
              </div>
              <div className="w-24">
                <label className="block text-[#7ab88a] text-xs mb-1">Moneda</label>
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full px-2 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none">
                  <option className="bg-[#0a1208]">USD</option><option className="bg-[#0a1208]">MXN</option><option className="bg-[#0a1208]">EUR</option>
                </select>
              </div>
            </div>
            {msg && !msg.ok && <p className="text-red-400 text-xs">{msg.text}</p>}
            <div className="flex gap-2">
              <button onClick={createPool} disabled={creating || !form.name.trim()}
                className="px-4 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                {creating ? "Creando..." : "Crear liga"}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-3 py-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && msg.ok && (
        <div className="p-2 rounded-lg text-xs text-center text-green-400"
          style={{ background: "rgba(10,18,8,0.5)", border: "1px solid #2a5438" }}>
          {msg.text}
        </div>
      )}
      {msg && !msg.ok && !showCreate && (
        <div className="p-2 rounded-lg text-xs text-center text-red-400"
          style={{ background: "rgba(10,18,8,0.5)", border: "1px solid #2a5438" }}>
          {msg.text}
        </div>
      )}

      {/* Pool list */}
      <div className="flex flex-col gap-3">
        {pools.length === 0 && (
          <p className="text-[#4a7a5a] text-sm text-center py-8">No hay ligas todavía.</p>
        )}
        {pools.map(p => {
          const isLegacy = p.id === LEGACY_POOL_ID
          const pot = p.price_per_quiniela * p.quiniela_count
          const isEditing = editingId === p.id
          return (
            <div key={p.id} className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${p.is_active ? "#2a5438" : "#542a2a"}` }}>
              {/* Card header */}
              <div className="p-4" style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{p.name}</span>
                      {isLegacy && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-bold text-black"
                          style={{ background: "#F5C518" }}>Principal</span>
                      )}
                      <span className={`text-xs font-bold ${p.is_active ? "text-green-400" : "text-red-400"}`}>
                        {p.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    {p.description && <p className="text-[#7ab88a] text-xs mt-0.5">{p.description}</p>}
                    <div className="flex gap-3 mt-1 flex-wrap">
                      <span className="text-[#4a7a5a] text-xs">👥 {p.member_count} miembros</span>
                      <span className="text-[#4a7a5a] text-xs">🎯 {p.quiniela_count} quinielas</span>
                      <span className="text-[#7ab88a] text-xs font-semibold">${p.price_per_quiniela} {p.currency}/quiniela</span>
                      {p.quiniela_count > 0 && (
                        <span className="text-[#F5C518] text-xs font-bold">Pozo: ${pot} {p.currency}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => isEditing ? setEditingId(null) : startEdit(p)}
                      className="py-1.5 px-3 rounded-lg text-xs font-bold border text-[#7ab88a] border-[#2a5438] hover:text-white hover:border-[#F5C518] transition-colors">
                      {isEditing ? "✕ Cerrar" : "✎ Editar"}
                    </button>
                    {!isLegacy && (
                      <button onClick={() => toggleActive(p.id, p.is_active)} disabled={loading !== null}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold border disabled:opacity-50 ${p.is_active ? "text-red-400 border-[#542a2a]" : "text-green-400 border-[#1a3a1a]"}`}>
                        {loading === p.id + "toggle" ? "..." : p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    )}
                    {!isLegacy && confirmDelete === p.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deletePool(p.id)} disabled={loading !== null}
                          className="py-1.5 px-3 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: "#991b1b" }}>
                          {loading === p.id + "delete" ? "..." : "¿Confirmar?"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="py-1.5 px-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">✕</button>
                      </div>
                    ) : (
                      !isLegacy && (
                        <button onClick={() => setConfirmDelete(p.id)}
                          disabled={loading !== null || p.quiniela_count > 0}
                          className="py-1.5 px-3 rounded-lg text-xs font-bold text-red-400 border border-[#2a5438] hover:border-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                          Eliminar
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div className="px-4 pb-4 pt-3 flex flex-col gap-3" style={{ background: "#0a1208", borderTop: "1px solid #2a5438" }}>
                  <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-40">
                      <label className="block text-[#7ab88a] text-xs mb-1">Nombre *</label>
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
                    </div>
                    <div className="flex-1 min-w-40">
                      <label className="block text-[#7ab88a] text-xs mb-1">Descripción</label>
                      <input type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap items-end">
                    <div className="w-36">
                      <label className="block text-[#7ab88a] text-xs mb-1">Precio por quiniela</label>
                      <div className="flex items-center gap-1">
                        <span className="text-[#7ab88a] text-xs">$</span>
                        <input type="number" min="0" step="0.5" value={editForm.price}
                          onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none placeholder:text-[#3a6348]" />
                      </div>
                    </div>
                    <div className="w-24">
                      <label className="block text-[#7ab88a] text-xs mb-1">Moneda</label>
                      <select value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full px-2 py-2 rounded-lg text-white text-sm bg-[#0a1208] border border-[#2a5438] focus:border-[#F5C518] outline-none">
                        <option className="bg-[#0a1208]">USD</option><option className="bg-[#0a1208]">MXN</option><option className="bg-[#0a1208]">EUR</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[#7ab88a] text-xs">Estado:</label>
                      <button type="button"
                        onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors ${editForm.is_active ? "text-green-400 border-green-700" : "text-red-400 border-red-900"}`}>
                        {editForm.is_active ? "Activo" : "Inactivo"}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(p.id)} disabled={editSaving || !editForm.name.trim()}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                      {editSaving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">
                      Cancelar
                    </button>
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
