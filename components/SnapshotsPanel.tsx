"use client"

import { useState } from "react"

interface QuinielaResult {
  id: string
  name: string
  status: string
  user_email: string
  display_name: string | null
  snapshot_count: number
}

interface Snapshot {
  id: string
  snapshot_type: string
  created_at: string
  notes: string | null
}

const TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  initial_submit:  { bg: "#dcfce7", color: "#15803d", label: "Envío inicial" },
  before_r32_sync: { bg: "#dbeafe", color: "#1d4ed8", label: "Antes R32 sync" },
  after_r32_submit:{ bg: "#ede9fe", color: "#6d28d9", label: "Después R32 sync" },
  manual_backup:   { bg: "#fef9c3", color: "#92400e", label: "Backup manual" },
  restore_point:   { bg: "#fee2e2", color: "#b91c1c", label: "Restore point" },
}

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? { bg: "#f3f4f6", color: "#374151", label: type }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export default function SnapshotsPanel() {
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<QuinielaResult[]>([])
  const [searchMsg, setSearchMsg] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState("")
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loadingSnaps, setLoadingSnaps] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setSearchMsg(null)
    setResults([])
    setSelectedId(null)
    setSnapshots([])
    setRestoreMsg(null)
    try {
      const res = await fetch(`/api/admin/quinielas/search?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      if (!res.ok) { setSearchMsg(data.error ?? "Error"); return }
      setResults(data.results ?? [])
      if ((data.results ?? []).length === 0) setSearchMsg("Sin resultados para esa búsqueda.")
    } finally {
      setSearching(false)
    }
  }

  async function loadSnapshots(id: string, name: string) {
    setSelectedId(id)
    setSelectedName(name)
    setLoadingSnaps(true)
    setSnapshots([])
    setRestoreMsg(null)
    try {
      const res = await fetch(`/api/admin/quinielas/${id}/snapshots`)
      const data = await res.json()
      if (!res.ok) { setRestoreMsg(data.error ?? "Error"); return }
      setSnapshots(data.snapshots ?? [])
    } finally {
      setLoadingSnaps(false)
    }
  }

  async function doRestore() {
    if (!restoreTarget || !selectedId) return
    setRestoring(true)
    setRestoreMsg(null)
    try {
      const res = await fetch(`/api/admin/quinielas/${selectedId}/restore-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_id: restoreTarget.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRestoreMsg(`Error: ${data.error}`)
        return
      }
      setRestoreMsg(`✅ ${data.message}`)
      setRestoreTarget(null)
      await loadSnapshots(selectedId, selectedName)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-gray-500">Busca una quiniela para ver su historial de snapshots y restaurar un estado anterior.</p>

      {/* ── Search ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 bg-white border border-gray-200 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Buscar quiniela</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="Nombre de quiniela o UUID..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
          />
          <button
            onClick={search}
            disabled={searching || !query.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
            style={{ background: "#F5C518", color: "#111827" }}
          >
            {searching ? "..." : "Buscar"}
          </button>
        </div>

        {searchMsg && <p className="text-xs text-gray-500 mt-2">{searchMsg}</p>}

        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => loadSnapshots(r.id, r.name)}
                className="text-left px-3 py-2.5 rounded-xl border transition-colors"
                style={{
                  background: selectedId === r.id ? "#fffbeb" : "#f9fafb",
                  borderColor: selectedId === r.id ? "#fbbf24" : "#e5e7eb",
                }}
              >
                <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                <span className="text-gray-400 ml-2 text-xs">{r.user_email}</span>
                <span className="float-right text-xs" style={{ color: "#6b7280" }}>
                  {r.snapshot_count} snapshot{r.snapshot_count !== 1 ? "s" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Snapshots list ──────────────────────────────────────────────────────── */}
      {selectedId && (
        <div className="rounded-2xl p-5 bg-white border border-gray-200 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">
            Snapshots de &ldquo;{selectedName}&rdquo;
          </h3>

          {loadingSnaps && <p className="text-xs text-gray-500">Cargando...</p>}

          {!loadingSnaps && snapshots.length === 0 && (
            <p className="text-xs text-gray-500">No hay snapshots para esta quiniela.</p>
          )}

          {!loadingSnaps && snapshots.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                    <th className="text-left py-2 pr-4">Tipo</th>
                    <th className="text-left py-2 pr-4">Fecha</th>
                    <th className="text-left py-2 pr-4">Notas</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td className="py-2.5 pr-4"><TypeBadge type={s.snapshot_type} /></td>
                      <td className="py-2.5 pr-4" style={{ color: "#374151" }}>
                        {new Date(s.created_at).toLocaleString("es-MX", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: "#6b7280" }}>{s.notes ?? "—"}</td>
                      <td className="py-2.5">
                        <button
                          onClick={() => { setRestoreTarget(s); setRestoreMsg(null) }}
                          className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                          style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}
                        >
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {restoreMsg && (
            <p className={`mt-3 text-xs font-semibold ${restoreMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
              {restoreMsg}
            </p>
          )}
        </div>
      )}

      {/* ── Restore confirmation modal ──────────────────────────────────────────── */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="font-black text-gray-900 text-lg mb-2">Confirmar restauración</h2>
            <p className="text-sm text-gray-600 mb-4">
              Esto reemplazará las predicciones actuales de{" "}
              <strong>{selectedName}</strong> con la copia del snapshot{" "}
              <TypeBadge type={restoreTarget.snapshot_type} /> del{" "}
              {new Date(restoreTarget.created_at).toLocaleString("es-MX", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}.
            </p>
            <div className="rounded-xl p-3 mb-5 text-xs font-semibold"
              style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e" }}>
              Se creará un backup del estado actual antes de restaurar.
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
                className="px-4 py-2 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={doRestore}
                disabled={restoring}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-colors"
                style={{ background: restoring ? "#ef4444aa" : "#dc2626" }}
              >
                {restoring ? "Restaurando..." : "Sí, restaurar ahora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
