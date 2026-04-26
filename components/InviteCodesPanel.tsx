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
    <div className="flex flex-col gap-5">
      {/* Create new code */}
      <div className="rounded-2xl p-5"
        style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)", border: "2px solid #F5C518" }}>
        <h2 className="text-[#F5C518] font-bold text-sm mb-4">Crear Nuevo Código</h2>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="block text-[#7ab88a] text-xs mb-1">Código *</label>
              <input
                type="text"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                placeholder="ej. AMIGOS2026"
                className="w-full px-3 py-2 rounded-lg text-white font-mono uppercase text-sm"
                style={{ background: "#0a1208", border: "1px solid #2a5438" }}
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-[#7ab88a] text-xs mb-1">Descripción</label>
              <input
                type="text"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Para la liga de amigos"
                className="w-full px-3 py-2 rounded-lg text-white text-sm"
                style={{ background: "#0a1208", border: "1px solid #2a5438" }}
              />
            </div>
            <div className="w-28">
              <label className="block text-[#7ab88a] text-xs mb-1">Usos máx.</label>
              <input
                type="number"
                min="1"
                value={newMaxUses}
                onChange={e => setNewMaxUses(e.target.value)}
                placeholder="∞"
                className="w-full px-3 py-2 rounded-lg text-white text-sm"
                style={{ background: "#0a1208", border: "1px solid #2a5438" }}
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-[#7ab88a] text-xs mb-1">Liga</label>
              <select
                value={newPoolId}
                onChange={e => setNewPoolId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-white text-sm"
                style={{ background: "#0a1208", border: "1px solid #2a5438" }}>
                {pools.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#0a1208]">{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setNewAutoApprove(v => !v)}
                className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${newAutoApprove ? "bg-[#F5C518] border-[#F5C518]" : "border-[#2a5438]"}`}>
                {newAutoApprove && <svg width="12" height="12" fill="none" stroke="black" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className="text-[#7ab88a] text-xs">Auto-aprobar usuarios al registrarse con este código</span>
            </label>
            <button onClick={createCode} disabled={creating || !newCode.trim()}
              className="py-2 px-6 rounded-xl font-bold text-black text-sm uppercase disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
              {creating ? "Creando..." : "+ Crear Código"}
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`p-2 rounded-lg text-xs text-center ${msg.ok ? "text-green-400" : "text-red-400"}`}
          style={{ background: "rgba(10,18,8,0.5)", border: "1px solid #2a5438" }}>
          {msg.text}
        </div>
      )}

      {/* Codes list */}
      <div className="flex flex-col gap-3">
        {codes.length === 0 && (
          <p className="text-[#4a7a5a] text-sm text-center py-8">No hay códigos. Crea uno arriba.</p>
        )}
        {codes.map(c => {
          const usageLabel = c.max_uses ? `${c.uses_count} / ${c.max_uses}` : `${c.uses_count} usos`
          const pct = c.max_uses ? Math.min(100, Math.round((c.uses_count / c.max_uses) * 100)) : null
          const isExhausted = c.max_uses !== null && c.uses_count >= c.max_uses

          return (
            <div key={c.id} className="rounded-xl p-4"
              style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)", border: `1px solid ${c.is_active && !isExhausted ? "#2a5438" : "#542a2a"}` }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-white text-sm">{c.code}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.is_active && !isExhausted ? "text-green-400" : "text-red-400"}`}
                      style={{ background: "rgba(0,0,0,0.3)" }}>
                      {isExhausted ? "Agotado" : c.is_active ? "Activo" : "Inactivo"}
                    </span>
                    {c.auto_approve && (
                      <span className="text-xs text-[#7ab88a]">⚡ Auto-aprueba</span>
                    )}
                  </div>
                  {c.description && <p className="text-[#7ab88a] text-xs mt-0.5">{c.description}</p>}
                  {c.pools && (
                    <p className="text-[#4a7a5a] text-xs mt-0.5">
                      🏟️ Liga: <span className="text-[#7ab88a]">{c.pools.name}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[#4a7a5a] text-xs">{usageLabel}</span>
                    {pct !== null && (
                      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#0a1208" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#ef4444" : "#F5C518" }} />
                      </div>
                    )}
                    <span className="text-[#4a7a5a] text-xs">
                      {new Date(c.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => toggleActive(c.id, c.is_active)} disabled={loading !== null}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold border disabled:opacity-50 ${c.is_active ? "text-red-400 border-[#542a2a] hover:bg-[#2a0a0a]" : "text-green-400 border-[#1a3a1a] hover:bg-[#0a2a0a]"}`}>
                    {loading === c.id + "active" ? "..." : c.is_active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => patchCode(c.id, { auto_approve: !c.auto_approve })} disabled={loading !== null}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold border border-[#2a5438] text-[#7ab88a] hover:border-[#F5C518] disabled:opacity-50">
                    {loading === c.id + "patch" ? "..." : c.auto_approve ? "Quitar auto-aprobación" : "Activar auto-aprobación"}
                  </button>
                  {confirmDelete === c.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => deleteCode(c.id)} disabled={loading !== null}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                        style={{ background: "#991b1b" }}>
                        {loading === c.id + "delete" ? "..." : "¿Confirmar?"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="py-1.5 px-2 rounded-lg text-xs text-[#7ab88a] border border-[#2a5438]">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(c.id)} disabled={loading !== null || c.uses_count > 0}
                      className="py-1.5 px-3 rounded-lg text-xs font-bold text-red-400 border border-[#2a5438] hover:border-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
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
