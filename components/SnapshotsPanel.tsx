"use client"

import { useState } from "react"
import { useT } from "@/components/LangProvider"
import { useLanguage } from "@/components/LangProvider"

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

interface SnapshotViewData {
  snapshot: {
    id: string
    quiniela_id: string
    snapshot_type: string
    created_at: string
    notes: string | null
    snapshot_data: {
      quiniela: AnyRecord
      predictions: AnyRecord[]
      bracket_picks: AnyRecord[]
      captured_at: string
    }
  }
  fixtures: Record<string, { home: string; away: string; group: string; kickoff: string | null }>
}

function TypeBadge({ type }: { type: string }) {
  const t = useT()
  const TYPE_STYLES: Record<string, { bg: string; color: string; labelKey: string }> = {
    initial_submit:   { bg: "#dcfce7", color: "#15803d", labelKey: "snapshot_type_initial_submit" },
    before_r32_sync:  { bg: "#dbeafe", color: "#1d4ed8", labelKey: "snapshot_type_before_r32" },
    after_r32_submit: { bg: "#ede9fe", color: "#6d28d9", labelKey: "snapshot_type_after_r32" },
    manual_backup:    { bg: "#fef9c3", color: "#92400e", labelKey: "snapshot_type_manual_backup" },
    restore_point:    { bg: "#fee2e2", color: "#b91c1c", labelKey: "snapshot_type_restore_point" },
  }
  const s = TYPE_STYLES[type]
  const label = s ? t(s.labelKey as Parameters<typeof t>[0]) : type
  const bg    = s?.bg    ?? "#f3f4f6"
  const color = s?.color ?? "#374151"
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: bg, color }}>
      {label}
    </span>
  )
}

// ── Snapshot view modal ────────────────────────────────────────────────────────

const PHASE_ORDER: Record<string, number> = {
  FIN: 0, "3P": 1, SF: 2, QF: 3, R16: 4, R32: 5,
}

function slotPhaseOrder(slotKey: string): number {
  for (const prefix of Object.keys(PHASE_ORDER)) {
    if (slotKey === prefix || slotKey.startsWith(prefix + "-")) return PHASE_ORDER[prefix]
  }
  return 9
}

function slotPhaseLabel(slotKey: string): string {
  if (slotKey === "FIN") return "Final"
  if (slotKey === "3P")  return "Tercer lugar"
  if (slotKey.startsWith("SF"))  return "Semifinales"
  if (slotKey.startsWith("QF"))  return "Cuartos de final"
  if (slotKey.startsWith("R16")) return "Octavos de final"
  if (slotKey.startsWith("R32")) return "Ronda de 32"
  return slotKey
}

function pickWinner(
  homeName: string | null, awayName: string | null,
  homeScore: number | null, awayScore: number | null,
  penaltiesWinner: string | null,
): string | null {
  if (homeScore == null || awayScore == null) return null
  if (homeScore > awayScore)  return homeName ?? "Home"
  if (awayScore > homeScore)  return awayName ?? "Away"
  if (penaltiesWinner === "home") return homeName ?? "Home"
  if (penaltiesWinner === "away") return awayName ?? "Away"
  return null
}

function SnapshotViewModal({
  data,
  loading,
  onClose,
  quinielaName,
  userEmail,
}: {
  data: SnapshotViewData | null
  loading: boolean
  onClose: () => void
  quinielaName: string
  userEmail: string
}) {
  if (!data && !loading) return null

  const snap     = data?.snapshot
  const snapData = snap?.snapshot_data
  const q        = snapData?.quiniela ?? {}
  const fixtures = data?.fixtures ?? {}

  // Sort bracket picks: Final first, then SF, QF, R16, R32
  const bracketPicks = [...(snapData?.bracket_picks ?? [])]
    .sort((a, b) => {
      const od = slotPhaseOrder(a.slot_key) - slotPhaseOrder(b.slot_key)
      if (od !== 0) return od
      return a.slot_key.localeCompare(b.slot_key)
    })

  // Group predictions by group_name
  const predsByGroup: Record<string, AnyRecord[]> = {}
  for (const p of snapData?.predictions ?? []) {
    const fx    = fixtures[String(p.fixture_id)]
    const group = fx?.group ?? "Grupo"
    if (!predsByGroup[group]) predsByGroup[group] = []
    predsByGroup[group].push(p)
  }
  const groupNames = Object.keys(predsByGroup).sort()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl w-full mx-4 shadow-2xl flex flex-col"
        style={{ maxWidth: "52rem", maxHeight: "90vh" }}
      >
        {/* ── Modal header ── */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
              Vista de respaldo — solo lectura
            </p>
            <h2 className="font-black text-gray-900 text-lg leading-tight">{quinielaName}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {snap && <TypeBadge type={snap.snapshot_type} />}
              {snap && (
                <span className="text-xs text-gray-400">
                  {new Date(snap.created_at).toLocaleString("es-MX", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              )}
              {userEmail && <span className="text-xs text-gray-400">{userEmail}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-xl font-bold"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="overflow-y-auto p-6 flex flex-col gap-6">

          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Cargando snapshot…</p>
          )}

          {!loading && !data && (
            <p className="text-sm text-red-500 text-center py-8">No se pudo cargar el snapshot.</p>
          )}

          {!loading && data && (
            <>
              {/* ── Quiniela header ── */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Datos principales
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: "Status",   value: q.status ?? "—" },
                    { label: "Campeón",  value: q.champion_team_name ?? "—" },
                    { label: "Goleador", value: q.top_scorer_pick ?? "—" },
                    { label: "Más goles (equipo)", value: q.most_goals_team_pick ?? "—" },
                    { label: "Puntos totales",     value: q.total_points ?? 0 },
                    { label: "Resultados exactos", value: q.exact_results ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-gray-900 truncate">{String(value)}</p>
                    </div>
                  ))}
                </div>
                {snap?.notes && (
                  <p className="mt-2 text-xs text-gray-500 italic">Nota: {snap.notes}</p>
                )}
              </section>

              {/* ── Bracket picks ── */}
              {bracketPicks.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Eliminatorias — datos exactos del respaldo
                  </h3>
                  <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #e5e7eb" }}>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">Partido</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">Local</th>
                          <th className="text-center px-2 py-2 font-bold text-gray-500">Marcador</th>
                          <th className="text-right px-3 py-2 font-bold text-gray-500">Visitante</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">Campeón pick</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let lastPhase = ""
                          return bracketPicks.map(bp => {
                            const phaseLabel = slotPhaseLabel(bp.slot_key)
                            const showHeader = phaseLabel !== lastPhase
                            lastPhase = phaseLabel
                            const winner = pickWinner(
                              bp.home_team_name_pred, bp.away_team_name_pred,
                              bp.home_score_pred, bp.away_score_pred,
                              bp.penalties_winner,
                            )
                            const hasScore = bp.home_score_pred != null && bp.away_score_pred != null
                            return [
                              showHeader ? (
                                <tr key={`phase-${bp.slot_key}`}>
                                  <td colSpan={5} className="px-3 pt-4 pb-1">
                                    <span className="text-[10px] uppercase tracking-widest font-black text-gray-400">
                                      {phaseLabel}
                                    </span>
                                  </td>
                                </tr>
                              ) : null,
                              <tr key={bp.slot_key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td className="px-3 py-2 font-mono text-gray-400">{bp.slot_key}</td>
                                <td className="px-3 py-2 font-semibold text-gray-800 max-w-[140px] truncate">
                                  {bp.home_team_name_pred ?? <span className="text-gray-300 italic">—</span>}
                                </td>
                                <td className="px-2 py-2 text-center font-black text-gray-900">
                                  {hasScore
                                    ? `${bp.home_score_pred} – ${bp.away_score_pred}`
                                    : <span className="text-gray-300">—</span>
                                  }
                                  {bp.penalties_winner && (
                                    <span className="block text-[9px] text-gray-400 font-normal">
                                      pen. {bp.penalties_winner}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-semibold text-gray-800 text-right max-w-[140px] truncate">
                                  {bp.away_team_name_pred ?? <span className="text-gray-300 italic">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {winner ? (
                                    <span className="px-2 py-0.5 rounded-full font-bold text-[10px]"
                                      style={{ background: "#dcfce7", color: "#15803d" }}>
                                      {winner}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              </tr>,
                            ]
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Group predictions ── */}
              {groupNames.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Fase de grupos ({(snapData?.predictions ?? []).length} predicciones)
                  </h3>
                  <div className="flex flex-col gap-4">
                    {groupNames.map(groupName => (
                      <div key={groupName}>
                        <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">
                          Grupo {groupName}
                        </p>
                        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #e5e7eb" }}>
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {predsByGroup[groupName].map((p: AnyRecord) => {
                                const fx = fixtures[String(p.fixture_id)]
                                const home = fx?.home ?? `Fixture ${p.fixture_id}`
                                const away = fx?.away ?? `Fixture ${p.fixture_id}`
                                const hasScore = p.home_score_pred != null && p.away_score_pred != null
                                return (
                                  <tr key={p.fixture_id ?? p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td className="px-3 py-1.5 font-semibold text-gray-800 w-1/3 truncate">{home}</td>
                                    <td className="px-2 py-1.5 text-center font-black text-gray-900 w-16">
                                      {hasScore
                                        ? `${p.home_score_pred} – ${p.away_score_pred}`
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-1.5 font-semibold text-gray-800 text-right w-1/3 truncate">{away}</td>
                                    <td className="px-3 py-1.5 text-right w-20">
                                      {hasScore && (() => {
                                        const h = p.home_score_pred, a = p.away_score_pred
                                        const w = h > a ? home : a > h ? away : "Empate"
                                        return (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                            style={{
                                              background: w === "Empate" ? "#f3f4f6" : "#dcfce7",
                                              color:      w === "Empate" ? "#6b7280" : "#15803d",
                                            }}>
                                            {w === "Empate" ? "E" : w === home ? "L" : "V"}
                                          </span>
                                        )
                                      })()}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Modal footer ── */}
        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-bold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SnapshotsPanel() {
  const t = useT()
  const { lang } = useLanguage()
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<QuinielaResult[]>([])
  const [searchMsg, setSearchMsg] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState("")
  const [selectedEmail, setSelectedEmail] = useState("")
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loadingSnaps, setLoadingSnaps] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)

  // View snapshot modal
  const [viewTarget, setViewTarget] = useState<Snapshot | null>(null)
  const [viewData, setViewData] = useState<SnapshotViewData | null>(null)
  const [loadingView, setLoadingView] = useState(false)

  const dateLocale = lang === "en" ? "en-US" : "es-MX"

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(dateLocale, {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }

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
      if ((data.results ?? []).length === 0) setSearchMsg(t("snapshots_no_results"))
    } finally {
      setSearching(false)
    }
  }

  async function loadSnapshots(id: string, name: string, email: string) {
    setSelectedId(id)
    setSelectedName(name)
    setSelectedEmail(email)
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

  async function openView(s: Snapshot) {
    setViewTarget(s)
    setViewData(null)
    setLoadingView(true)
    try {
      const res = await fetch(`/api/admin/snapshot/${s.id}`)
      const data = await res.json()
      if (!res.ok) {
        setViewData(null)
        return
      }
      setViewData(data as SnapshotViewData)
    } finally {
      setLoadingView(false)
    }
  }

  function closeView() {
    setViewTarget(null)
    setViewData(null)
    setLoadingView(false)
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
      await loadSnapshots(selectedId, selectedName, selectedEmail)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-gray-500">{t("snapshots_intro")}</p>

      {/* ── Search ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 bg-white border border-gray-200 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-3">{t("snapshots_search_title")}</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder={t("snapshots_search_ph")}
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
            {searching ? "..." : t("snapshots_search_btn")}
          </button>
        </div>

        {searchMsg && <p className="text-xs text-gray-500 mt-2">{searchMsg}</p>}

        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => loadSnapshots(r.id, r.name, r.user_email)}
                className="text-left px-3 py-2.5 rounded-xl border transition-colors"
                style={{
                  background:   selectedId === r.id ? "#fffbeb" : "#f9fafb",
                  borderColor:  selectedId === r.id ? "#fbbf24" : "#e5e7eb",
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
            {t("snapshots_panel_title")} &ldquo;{selectedName}&rdquo;
          </h3>

          {loadingSnaps && <p className="text-xs text-gray-500">{t("snapshots_loading")}</p>}

          {!loadingSnaps && snapshots.length === 0 && (
            <p className="text-xs text-gray-500">{t("snapshots_none")}</p>
          )}

          {!loadingSnaps && snapshots.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                    <th className="text-left py-2 pr-4">{t("snapshots_col_type")}</th>
                    <th className="text-left py-2 pr-4">{t("snapshots_col_date")}</th>
                    <th className="text-left py-2 pr-4">{t("snapshots_col_notes")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td className="py-2.5 pr-4"><TypeBadge type={s.snapshot_type} /></td>
                      <td className="py-2.5 pr-4" style={{ color: "#374151" }}>{formatDate(s.created_at)}</td>
                      <td className="py-2.5 pr-4" style={{ color: "#6b7280" }}>{s.notes ?? "—"}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Ver snapshot — read-only, never modifies data */}
                          <button
                            onClick={() => openView(s)}
                            className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                            style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" }}
                          >
                            Ver snapshot
                          </button>
                          {/* Restaurar — destructive, opens confirmation modal */}
                          <button
                            onClick={() => { setRestoreTarget(s); setRestoreMsg(null) }}
                            className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                            style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}
                          >
                            {t("snapshots_restore_btn")}
                          </button>
                        </div>
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

      {/* ── Snapshot view modal (read-only) ─────────────────────────────────────── */}
      {viewTarget && (
        <SnapshotViewModal
          data={viewData}
          loading={loadingView}
          onClose={closeView}
          quinielaName={selectedName}
          userEmail={selectedEmail}
        />
      )}

      {/* ── Restore confirmation modal ──────────────────────────────────────────── */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="font-black text-gray-900 text-lg mb-2">{t("snapshots_confirm_title")}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {t("snapshots_confirm_pre")}{" "}
              <strong>{selectedName}</strong>{" "}
              {t("snapshots_confirm_mid")}{" "}
              <TypeBadge type={restoreTarget.snapshot_type} />{" "}
              {t("snapshots_confirm_post")}{" "}
              {formatDate(restoreTarget.created_at)}.
            </p>
            <div className="rounded-xl p-3 mb-5 text-xs font-semibold"
              style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e" }}>
              {t("snapshots_confirm_warning")}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
                className="px-4 py-2 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={doRestore}
                disabled={restoring}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-colors"
                style={{ background: restoring ? "#ef4444aa" : "#dc2626" }}
              >
                {restoring ? t("snapshots_restoring") : t("snapshots_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
