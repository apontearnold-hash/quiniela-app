"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Fixture, Phase } from "@/lib/types"
import { PHASE_LABELS } from "@/lib/types"
import { useT } from "@/components/LangProvider"
import SnapshotsPanel from "@/components/SnapshotsPanel"
import PaymentsPanel from "@/components/PaymentsPanel"

interface Props {
  fixtures: Fixture[]
  defaultTab?: string
}

interface ResultState {
  homeScore: string
  awayScore: string
  wentToPenalties: boolean
  penaltiesWinner: string
  saving: boolean
  saved: boolean
  error: string | null
  hasResult: boolean
}

interface AdminRow { id: string; email: string; created_at: string }

const VALID_TABS = ["results", "sync", "ligas", "config", "snapshots", "pagos"] as const
type TabKey = typeof VALID_TABS[number]

export default function AdminPanel({ fixtures, defaultTab }: Props) {
  const t = useT()
  const router = useRouter()
  const initialTab: TabKey = (VALID_TABS as readonly string[]).includes(defaultTab ?? "") ? (defaultTab as TabKey) : "results"
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [selectedPhase, setSelectedPhase] = useState<Phase>("groups")
  const [results, setResults] = useState<Record<number, ResultState>>(() => {
    const init: Record<number, ResultState> = {}
    fixtures.forEach(f => {
      init[f.id] = {
        homeScore: f.home_score?.toString() ?? "",
        awayScore: f.away_score?.toString() ?? "",
        wentToPenalties: f.went_to_penalties ?? false,
        penaltiesWinner: f.penalties_winner ?? "",
        saving: false, saved: false, error: null,
        hasResult: f.home_score != null,
      }
    })
    return init
  })

  // Results tab — per-fixture state
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState<Record<number, boolean>>({})
  const [clearing, setClearing] = useState<Record<number, boolean>>({})

  // Results tab — simulation state
  const [simulating, setSimulating] = useState(false)
  const [simulateConfirm, setSimulateConfirm] = useState(false)
  const [clearingSimulation, setClearingSimulation] = useState(false)
  const [clearSimConfirm, setClearSimConfirm] = useState(false)
  const [simMsg, setSimMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Config tab — bracket placeholder fixtures
  const [creatingPlaceholders, setCreatingPlaceholders] = useState(false)
  const [createPlaceholderMsg, setCreatePlaceholderMsg] = useState<string | null>(null)
  const [cleaningPlaceholders, setCleaningPlaceholders] = useState(false)
  const [cleanPlaceholderMsg, setCleanPlaceholderMsg] = useState<string | null>(null)

  // Sync tab — importar fixtures
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [syncBreakdown, setSyncBreakdown] = useState<string[] | null>(null)
  // Sync tab — refrescar resultados
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  // Sync tab — API diagnostics
  const [diagLoading, setDiagLoading] = useState(false)
  const [diag, setDiag] = useState<{
    keyPresent?: boolean; success?: boolean; error?: string;
    leagueName?: string; country?: string;
    coverage?: Record<string, unknown>; timestamp?: string
  } | null>(null)
  // Sync tab — historial de sync
  interface SyncLogEntry { id: number; sync_type: string; status: string; message: string; rows_affected: number; ran_at: string }
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([])

  // System tab
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [advanceMsg, setAdvanceMsg] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)
  // Bonus evaluation
  const [bonusScorer, setBonusScorer] = useState("")
  const [bonusGoalsTeam, setBonusGoalsTeam] = useState("")
  const [bonusEvaluating, setBonusEvaluating] = useState(false)
  const [bonusEvalMsg, setBonusEvalMsg] = useState<string | null>(null)

  // Config tab
  const [configPrice, setConfigPrice] = useState("")
  const [configCurrency, setConfigCurrency] = useState("USD")
  const [configLockDate, setConfigLockDate] = useState("")
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState<string | null>(null)
  const [lockSaving, setLockSaving] = useState(false)

  const phases: Phase[] = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]
  const phaseFixtures = fixtures.filter(f => f.phase === selectedPhase)

  useEffect(() => {
    if (activeTab !== "config") return
    loadAdmins()
    loadConfig()
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== "sync") return
    if (diag === null) loadDiagnostics()
    loadSyncLog()
  }, [activeTab])

  // When fixtures prop changes (e.g. after router.refresh()), seed results entries for any new fixture
  useEffect(() => {
    setResults(prev => {
      const updates: Record<number, ResultState> = {}
      fixtures.forEach(f => {
        if (!prev[f.id]) {
          updates[f.id] = {
            homeScore: f.home_score?.toString() ?? "",
            awayScore: f.away_score?.toString() ?? "",
            wentToPenalties: f.went_to_penalties ?? false,
            penaltiesWinner: f.penalties_winner ?? "",
            saving: false, saved: false, error: null,
            hasResult: f.home_score != null,
          }
        }
      })
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev
    })
  }, [fixtures])

  async function loadAdmins() {
    const res = await fetch("/api/admin/admins")
    if (res.ok) {
      const data = await res.json()
      setAdmins(data.admins ?? [])
    }
  }

  async function loadConfig() {
    setConfigLoading(true)
    try {
      const res = await fetch("/api/admin/config")
      if (res.ok) {
        const { config } = await res.json()
        if (config) {
          setConfigPrice(config.quiniela_price?.toString() ?? "")
          setConfigCurrency(config.currency ?? "USD")
          setConfigLockDate(config.lock_date ? new Date(config.lock_date).toISOString().slice(0, 16) : "")
        }
      }
    } finally {
      setConfigLoading(false)
    }
  }

  async function saveConfig() {
    setConfigSaving(true); setConfigMsg(null)
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quiniela_price: configPrice,
        currency: configCurrency,
        lock_date: configLockDate || null,
      }),
    })
    const data = await res.json()
    setConfigMsg(res.ok ? t("admin_config_saved") : `Error: ${data.error}`)
    setConfigSaving(false)
  }

  async function setLock(lock: boolean) {
    setLockSaving(true); setConfigMsg(null)
    const lock_date = lock ? new Date().toISOString() : null
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quiniela_price: configPrice || "0",
        currency: configCurrency,
        lock_date,
      }),
    })
    if (res.ok) {
      setConfigLockDate(lock ? new Date().toISOString().slice(0, 16) : "")
      setConfigMsg(lock ? t("admin_predictions_locked_msg") : t("admin_predictions_unlocked_msg"))
    } else {
      const data = await res.json()
      setConfigMsg(`Error: ${data.error}`)
    }
    setLockSaving(false)
  }

  async function saveResult(fixture: Fixture) {
    const r = results[fixture.id]
    if (!r) return
    const home = parseInt(r.homeScore)
    const away = parseInt(r.awayScore)
    if (isNaN(home) || isNaN(away)) return
    setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: true, error: null } }))
    const res = await fetch("/api/admin/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture_id: fixture.id,
        home_score: home,
        away_score: away,
        went_to_penalties: r.wentToPenalties,
        penalties_winner: r.penaltiesWinner || null,
        status: "finished",
      }),
    })
    const data = await res.json()
    if (res.ok) {
      const pipelineErr = data.pipelineError ? `Guardado. Error en recálculo: ${data.pipelineError}` : null
      setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: false, saved: true, hasResult: true, error: pipelineErr } }))
      router.refresh()
    } else {
      setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: false, error: data.error } }))
    }
  }

  async function clearResult(fixture: Fixture) {
    setClearing(prev => ({ ...prev, [fixture.id]: true }))
    setClearConfirm(prev => ({ ...prev, [fixture.id]: false }))
    const res = await fetch("/api/admin/results", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: fixture.id }),
    })
    const data = await res.json()
    setClearing(prev => ({ ...prev, [fixture.id]: false }))
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [fixture.id]: { ...prev[fixture.id], homeScore: "", awayScore: "", wentToPenalties: false, penaltiesWinner: "", saved: false, hasResult: false, error: data.pipelineError ? `Limpiado. Error en recálculo: ${data.pipelineError}` : null },
      }))
      router.refresh()
    } else {
      setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], error: data.error } }))
    }
  }

  async function simulateAll() {
    setSimulating(true); setSimulateConfirm(false); setSimMsg(null)
    const res = await fetch("/api/admin/simulate-phase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "all" }),
    })
    const data = await res.json()
    setSimulating(false)
    setSimMsg({ text: data.message ?? (data.error ? `Error: ${data.error}` : "Listo"), ok: res.ok })
  }

  async function createBracketFixtures() {
    setCreatingPlaceholders(true); setCreatePlaceholderMsg(null)
    const res = await fetch("/api/admin/create-bracket-fixtures", { method: "POST" })
    const data = await res.json()
    setCreatingPlaceholders(false)
    setCreatePlaceholderMsg(data.message ?? (data.error ? `Error: ${data.error}` : "Listo"))
    if (res.ok) router.refresh()
  }

  async function cleanBracketFixtures() {
    setCleaningPlaceholders(true); setCleanPlaceholderMsg(null)
    const res = await fetch("/api/admin/create-bracket-fixtures", { method: "DELETE" })
    const data = await res.json()
    setCleaningPlaceholders(false)
    setCleanPlaceholderMsg(data.message ?? (data.error ? `Error: ${data.error}` : "Listo"))
  }

  async function clearSimulation() {
    setClearingSimulation(true); setClearSimConfirm(false); setSimMsg(null)
    const res = await fetch("/api/admin/simulate-phase", { method: "DELETE" })
    const data = await res.json()
    setClearingSimulation(false)
    setSimMsg({ text: data.message ?? (data.error ? `Error: ${data.error}` : "Listo"), ok: res.ok })
  }

  async function recalculateAll() {
    setRecalculating(true); setRecalcMsg(null)
    const res = await fetch("/api/admin/recalculate", { method: "POST" })
    const data = await res.json()
    setRecalculating(false)
    setRecalcMsg(data.message || (data.error ? `Error: ${data.error}` : "Listo"))
  }

  async function advanceBracket() {
    setAdvancing(true); setAdvanceMsg(null)
    const res = await fetch("/api/admin/advance-bracket", { method: "POST" })
    const data = await res.json()
    setAdvancing(false)
    setAdvanceMsg(data.message || (data.error ? `Error: ${data.error}` : "Listo"))
  }

  async function backfillChampions() {
    setBackfilling(true); setBackfillMsg(null)
    const res = await fetch("/api/admin/backfill-champions", { method: "POST" })
    const data = await res.json()
    setBackfilling(false)
    setBackfillMsg(data.message || (data.error ? `Error: ${data.error}` : "Listo"))
  }

  async function evaluateBonus() {
    setBonusEvaluating(true); setBonusEvalMsg(null)
    const topScorers = bonusScorer.split(",").map(s => s.trim()).filter(Boolean)
    const goalsTeams = bonusGoalsTeam.split(",").map(s => s.trim()).filter(Boolean)
    const res = await fetch("/api/admin/bonus-evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_scorer_winners: topScorers, most_goals_team_winners: goalsTeams }),
    })
    const data = await res.json()
    setBonusEvaluating(false)
    setBonusEvalMsg(data.message || (data.error ? `Error: ${data.error}` : "Listo"))
  }

  async function loadDiagnostics() {
    setDiagLoading(true)
    try {
      const res = await fetch("/api/admin/diagnostics")
      const data = await res.json()
      setDiag(data)
    } catch (err) {
      setDiag({ keyPresent: true, success: false, error: String(err) })
    }
    setDiagLoading(false)
  }

  async function loadSyncLog() {
    try {
      const res = await fetch("/api/admin/sync")
      const data = await res.json()
      setSyncLog(data.logs ?? [])
    } catch {
      // Si la tabla no existe aún, ignorar silenciosamente
    }
  }

  async function syncFixtures() {
    setSyncing(true); setSyncMsg("Importando fixtures..."); setSyncError(false); setSyncBreakdown(null)
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setSyncMsg(data.message ?? "Listo")
        setSyncBreakdown(data.breakdown ?? null)
        setSyncError(false)
      } else {
        setSyncMsg(data.error ?? "Error desconocido")
        setSyncError(true)
      }
    } catch (err) {
      setSyncMsg(`Error de red: ${err instanceof Error ? err.message : String(err)}`)
      setSyncError(true)
    }
    setSyncing(false)
    loadSyncLog()
  }

  async function refreshResults() {
    setRefreshing(true); setRefreshMsg("Actualizando resultados..."); setRefreshError(false)
    try {
      const res = await fetch("/api/admin/sync/results", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setRefreshMsg(data.message ?? "Listo")
        setRefreshError(false)
      } else {
        setRefreshMsg(data.error ?? "Error desconocido")
        setRefreshError(true)
      }
    } catch (err) {
      setRefreshMsg(`Error de red: ${err instanceof Error ? err.message : String(err)}`)
      setRefreshError(true)
    }
    setRefreshing(false)
    loadSyncLog()   // refresca el historial después de la acción
  }

  async function addAdmin() {
    if (!newAdminEmail.trim()) return
    setAdminLoading(true); setAdminMsg(null)
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newAdminEmail.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setNewAdminEmail(""); await loadAdmins(); setAdminMsg("Admin agregado") }
    else setAdminMsg(`Error: ${data.error}`)
    setAdminLoading(false)
  }

  async function removeAdmin(email: string) {
    setAdminLoading(true); setAdminMsg(null)
    const res = await fetch("/api/admin/admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (res.ok) { await loadAdmins(); setAdminMsg("Admin eliminado") }
    else setAdminMsg(`Error: ${data.error}`)
    setAdminLoading(false)
  }

  const cardStyle = { background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }
  const innerCardStyle = { background: "#f9fafb", border: "1px solid #e5e7eb" }

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-[#d1d5db]">
        {([
          { key: "results",   label: t("admin_tab_results_label") },
          { key: "sync",      label: t("admin_tab_sync_label") },
          { key: "ligas",     label: t("admin_tab_ligas_label") },
          { key: "config",    label: t("admin_tab_config_label") },
          { key: "snapshots", label: t("admin_tab_snapshots_label") },
          { key: "pagos",     label: t("admin_tab_pagos_label") },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-xs font-bold transition-colors ${activeTab === tab.key ? "bg-[#F5C518] text-black" : "text-[#6b7280] hover:text-[#111827] bg-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── RESULTS ────────────────────────────── */}
      {activeTab === "results" && (
        <div>
          <p className="text-[#6b7280] text-xs mb-4">Usa esta sección para corregir resultados reales o para probar el scoring antes del torneo.</p>
          <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2"
            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <span className="text-green-600 text-xs">✓</span>
            <p className="text-[#16a34a] text-xs">
              {t("save")} → recalcula puntos y avanza el bracket automáticamente.
            </p>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {phases.map(p => (
              <button key={p} onClick={() => setSelectedPhase(p)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPhase === p ? "bg-[#F5C518] text-black" : "border border-[#2a5438] text-[#7ab88a] hover:border-[#F5C518]"}`}>
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {phaseFixtures.length === 0 && <div className="text-center py-8 text-[#9ca3af]">No hay partidos en esta fase</div>}
            {phaseFixtures.map(fixture => {
              const r = results[fixture.id]
              if (!r) return null
              const kickoff = fixture.kickoff ? new Date(fixture.kickoff).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "?"
              const isKnockout = fixture.phase !== "groups"
              const teamLabel = (name: string | null, placeholder: string | null) => name || placeholder || "TBD"
              return (
                <div key={fixture.id} className="rounded-xl p-4" style={cardStyle}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                      <span className="text-[#111827] text-sm font-medium text-right truncate">{teamLabel(fixture.home_team_name, fixture.home_placeholder)}</span>
                      {fixture.home_team_flag && <img src={fixture.home_team_flag} alt="" className="w-7 h-5 object-contain rounded-sm flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input type="number" min="0" max="99" value={r.homeScore}
                        onChange={e => setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], homeScore: e.target.value } }))}
                        className="score-input" placeholder="-" />
                      <span className="text-[#6b7280] font-bold">:</span>
                      <input type="number" min="0" max="99" value={r.awayScore}
                        onChange={e => setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], awayScore: e.target.value } }))}
                        className="score-input" placeholder="-" />
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {fixture.away_team_flag && <img src={fixture.away_team_flag} alt="" className="w-7 h-5 object-contain rounded-sm flex-shrink-0" />}
                      <span className="text-[#111827] text-sm font-medium truncate">{teamLabel(fixture.away_team_name, fixture.away_placeholder)}</span>
                    </div>
                    <button onClick={() => saveResult(fixture)} disabled={r.saving}
                      className="flex-shrink-0 py-2 px-3 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}>
                      {r.saving ? "..." : r.saved ? `✓ ${t("saved")}` : t("save")}
                    </button>
                    {r.hasResult && (
                      clearing[fixture.id] ? (
                        <button disabled className="flex-shrink-0 py-2 px-3 rounded-lg text-xs font-medium border opacity-50" style={{ background: "white", border: "1px solid #fca5a5", color: "#dc2626" }}>
                          Limpiando…
                        </button>
                      ) : clearConfirm[fixture.id] ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => clearResult(fixture)}
                            className="py-2 px-3 rounded-lg font-bold text-white text-xs"
                            style={{ background: "#dc2626" }}>
                            ¿Confirmar?
                          </button>
                          <button onClick={() => setClearConfirm(prev => ({ ...prev, [fixture.id]: false }))}
                            className="py-2 px-2 rounded-lg text-xs font-medium"
                            style={{ background: "white", border: "1px solid #d1d5db", color: "#6b7280" }}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setClearConfirm(prev => ({ ...prev, [fixture.id]: true }))}
                          className="flex-shrink-0 py-2 px-3 rounded-lg text-xs font-medium"
                          style={{ background: "white", border: "1px solid #fca5a5", color: "#dc2626" }}>
                          Limpiar resultado
                        </button>
                      )
                    )}
                  </div>
                  {isKnockout && (
                    <div className="mt-3 pt-3 border-t border-[#1a3322] flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div
                          onClick={() => setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], wentToPenalties: !prev[fixture.id].wentToPenalties } }))}
                          className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${r.wentToPenalties ? "bg-[#F5C518] border-[#F5C518]" : "border-[#d1d5db]"}`}>
                          {r.wentToPenalties && <svg width="12" height="12" fill="none" stroke="black" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-[#6b7280] text-xs">{t("penales")}</span>
                      </label>
                      {r.wentToPenalties && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#6b7280] text-xs">{t("winners")}:</span>
                          <button onClick={() => setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], penaltiesWinner: "home" } }))}
                            className={`px-2 py-1 rounded text-xs font-medium ${r.penaltiesWinner === "home" ? "bg-[#F5C518] text-black" : "border border-[#d1d5db] text-[#374151]"}`}>
                            {teamLabel(fixture.home_team_name, fixture.home_placeholder)}
                          </button>
                          <button onClick={() => setResults(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], penaltiesWinner: "away" } }))}
                            className={`px-2 py-1 rounded text-xs font-medium ${r.penaltiesWinner === "away" ? "bg-[#F5C518] text-black" : "border border-[#d1d5db] text-[#374151]"}`}>
                            {teamLabel(fixture.away_team_name, fixture.away_placeholder)}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[#9ca3af] text-xs">{kickoff}{fixture.group_name && ` · ${fixture.group_name}`}{fixture.bracket_position && ` · ${fixture.bracket_position}`}</span>
                    {r.error && <span className="text-red-400 text-xs">{r.error}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SYNC ────────────────────────────── */}
      {activeTab === "sync" && (
        <div className="flex flex-col gap-4">

          {/* Intent banner */}
          <div className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <span className="text-lg flex-shrink-0">🕐</span>
            <div>
              <p className="text-[#F5C518] text-xs font-bold">Sincronización manual por ahora</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Durante el torneo deberás usar los botones de abajo para traer datos del API. La sincronización automática programada aún no está activa.</p>
            </div>
          </div>

          {/* API diagnostics */}
          <div className="rounded-2xl p-5"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[#111827] font-bold text-sm">Estado de la API</h2>
              <button onClick={loadDiagnostics} disabled={diagLoading}
                className="text-[#6b7280] text-xs hover:text-white disabled:opacity-40 underline">
                {diagLoading ? "Verificando..." : "Verificar"}
              </button>
            </div>

            {diagLoading && <p className="text-[#6b7280] text-xs">Conectando...</p>}

            {!diagLoading && diag && (
              <div className="flex flex-col gap-2">
                <DiagRow label="API Key" value={diag.keyPresent ? "✅ Presente" : "❌ Falta FOOTBALL_API_KEY en .env.local"} ok={diag.keyPresent} />
                <DiagRow label="Conexión" value={diag.success ? "✅ OK" : `❌ ${diag.error ?? "Fallo"}`} ok={diag.success} />
                {diag.success && (
                  <>
                    <DiagRow label="Liga" value={`${diag.leagueName ?? "?"} — ${diag.country ?? "?"}`} ok={true} />
                    {diag.coverage && (
                      <div className="mt-2 pt-2 border-t border-[#2a5438]">
                        <p className="text-[#6b7280] text-xs mb-1.5">Cobertura disponible:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(diag.coverage).map(([key, val]) => (
                            <span key={key} className="text-xs">
                              <span className={val ? "text-green-400" : "text-red-400"}>{val ? "✓" : "✗"}</span>
                              <span className="text-[#7ab88a] ml-1 capitalize">{key.replace(/_/g, " ")}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Acción 1: Importar fixtures */}
          <div className="rounded-2xl p-5"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <h2 className="text-[#111827] font-bold mb-1">📥 {t("admin_import")}</h2>
            <p className="text-[#6b7280] text-xs mb-1">Mundial 2026 · League ID: 1 · Season: 2026</p>
            <p className="text-[#9ca3af] text-xs mb-4">
              Trae todos los partidos del Mundial desde API-Football y los guarda en Supabase
              (equipos, fechas, grupos, fases). No crea duplicados — actualiza si ya existen.
            </p>

            {syncMsg && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <p className={syncError ? "text-red-400" : "text-[#F5C518]"}>{syncMsg}</p>
                {/* Desglose de rounds que devolvió la API */}
                {syncBreakdown && syncBreakdown.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[#6b7280] text-xs cursor-pointer">Ver desglose por ronda ({syncBreakdown.length} rondas)</summary>
                    <div className="mt-1 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                      {syncBreakdown.map(line => (
                        <span key={line} className="text-[#9ca3af] text-xs font-mono">{line}</span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Nota: los 32 partidos de eliminatoria llegan cuando equipos clasifican */}
            <div className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.2)' }}>
              <p className="text-[#F5C518] font-bold mb-0.5">ℹ️ Sobre el número de fixtures</p>
              <p className="text-[#7ab88a]">
                La API publica los 72 partidos de fase de grupos desde ahora. Los 32 partidos de eliminatoria
                (Ronda de 32, Octavos, Cuartos, Semis, Final) aparecerán automáticamente cuando los equipos clasifiquen.
                El total final será 104 partidos.
              </p>
            </div>

            <button onClick={syncFixtures} disabled={syncing || refreshing}
              className="py-2.5 px-6 rounded-xl font-bold text-black text-sm uppercase tracking-wide disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}>
              {syncing ? "Importando..." : "🔄 Importar Fixtures"}
            </button>
          </div>

          {/* Acción 2: Refrescar resultados */}
          <div className="rounded-2xl p-5"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <h2 className="text-[#111827] font-bold mb-1">⚽ {t("admin_refresh")}</h2>
            <p className="text-[#9ca3af] text-xs mb-4">
              Actualiza solo los scores y el status de los partidos que ya han comenzado o terminado.
              Más rápido que una importación completa — ideal para usar durante el torneo.
            </p>

            {refreshMsg && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <p className={refreshError ? "text-red-400" : "text-[#F5C518]"}>{refreshMsg}</p>
              </div>
            )}

            <button onClick={refreshResults} disabled={refreshing || syncing}
              className="py-2.5 px-6 rounded-xl font-bold text-black text-sm uppercase tracking-wide disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}>
              {refreshing ? "Actualizando..." : "⚡ Refrescar Resultados"}
            </button>
          </div>

          {/* Historial de sincronizaciones */}
          {syncLog.length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <h2 className="text-[#111827] font-bold mb-3">Historial de Sync</h2>
              <div className="flex flex-col gap-2">
                {syncLog.map(entry => {
                  const isOk  = entry.status === "success"
                  const label = entry.sync_type === "fixtures" ? "Fixtures" : "Resultados"
                  const time  = new Date(entry.ran_at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                  return (
                    <div key={entry.id} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg"
                      style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                      <span>{isOk ? "✅" : "❌"}</span>
                      <span className="text-[#F5C518] font-bold w-20 flex-shrink-0">{label}</span>
                      <span className={`flex-1 truncate ${isOk ? "text-[#7ab88a]" : "text-red-400"}`}>{entry.message}</span>
                      {entry.rows_affected > 0 && (
                        <span className="text-[#4a7a5a] flex-shrink-0">{entry.rows_affected} filas</span>
                      )}
                      <span className="text-[#4a7a5a] flex-shrink-0">{time}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LIGAS Y ACCESO ────────────────────────────── */}
      {activeTab === "ligas" && (
        <div className="flex flex-col gap-4">
          <p className="text-[#6b7280] text-xs">Gestiona ligas, códigos de invitación y usuarios.</p>

          <Link href="/admin/pools"
            className="flex items-center gap-4 p-5 rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span className="text-3xl">🏆</span>
            <div className="min-w-0">
              <p className="text-[#111827] font-bold">{t("admin_leagues")}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Crear ligas, configurar precio por quiniela, ver miembros</p>
            </div>
            <span className="text-[#4a7a5a] text-lg ml-auto flex-shrink-0">→</span>
          </Link>

          <Link href="/admin/invite-codes"
            className="flex items-center gap-4 p-5 rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span className="text-3xl">🔑</span>
            <div className="min-w-0">
              <p className="text-[#111827] font-bold">{t("admin_invite_codes")}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Crear códigos vinculados a una liga — el código asigna al usuario automáticamente</p>
            </div>
            <span className="text-[#4a7a5a] text-lg ml-auto flex-shrink-0">→</span>
          </Link>

          <Link href="/admin/users"
            className="flex items-center gap-4 p-5 rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span className="text-3xl">👥</span>
            <div className="min-w-0">
              <p className="text-[#111827] font-bold">{t("admin_users_link")}</p>
              <p className="text-[#6b7280] text-xs mt-0.5">Aprobar, bloquear, crear usuarios de prueba</p>
            </div>
            <span className="text-[#4a7a5a] text-lg ml-auto flex-shrink-0">→</span>
          </Link>
        </div>
      )}

      {/* ── CONFIGURACIÓN ────────────────────────────── */}
      {activeTab === "config" && (
        <div className="flex flex-col gap-5">

          {/* Bloque 1 — Configuración del torneo (oculto: precio lo define cada liga;
               lock_date sigue funcionando via lib/lock-date.ts — reactivar si se necesita
               control manual de fecha de cierre desde el panel admin) */}

          {/* Bloque 0 — Control de bloqueo de predicciones */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <h2 className="text-[#111827] font-bold mb-1">🔒 Predicciones</h2>
            <p className="text-[#6b7280] text-xs mb-4">
              Controla si los usuarios pueden editar y enviar sus quinielas. El cierre automático
              ocurre al inicio del primer partido, pero puedes adelantarlo o reabrirlo manualmente.
            </p>
            {configLoading ? (
              <p className="text-[#6b7280] text-xs">Cargando...</p>
            ) : (() => {
              const manuallyLocked = !!configLockDate
              const lockedDate = manuallyLocked ? new Date(configLockDate) : null
              const alreadyPassed = lockedDate ? lockedDate.getTime() <= Date.now() : false
              const statusLabel = manuallyLocked
                ? alreadyPassed
                  ? `Cerradas manualmente desde ${lockedDate!.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`
                  : `Cierre programado para ${lockedDate!.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`
                : "Abiertas (cierre automático al iniciar el primer partido)"
              return (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: manuallyLocked ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                      border: `1px solid ${manuallyLocked ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                    }}>
                    <span>{manuallyLocked ? "🔒" : "🔓"}</span>
                    <span className="text-xs font-medium" style={{ color: manuallyLocked ? "#ef4444" : "#22c55e" }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!manuallyLocked ? (
                      <button
                        onClick={() => setLock(true)}
                        disabled={lockSaving}
                        className="py-2 px-5 rounded-lg font-bold text-white text-xs uppercase tracking-wide disabled:opacity-50"
                        style={{ background: "#dc2626" }}>
                        {lockSaving ? t("admin_locking") : t("admin_lock_predictions")}
                      </button>
                    ) : (
                      <button
                        onClick={() => setLock(false)}
                        disabled={lockSaving}
                        className="py-2 px-5 rounded-lg font-bold text-white text-xs uppercase tracking-wide disabled:opacity-50"
                        style={{ background: "#16a34a" }}>
                        {lockSaving ? t("admin_unlocking") : t("admin_unlock_predictions")}
                      </button>
                    )}
                  </div>
                  {configMsg && (
                    <p className={`text-xs ${configMsg.startsWith("Error") ? "text-red-400" : "text-green-500"}`}>
                      {configMsg}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Bloque 2 — Fin del torneo */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <h2 className="text-[#111827] font-bold mb-1">🏆 Cerrar torneo y calcular bonos</h2>
            <p className="text-[#6b7280] text-xs mb-2">
              Ingresa los ganadores de las categorías bonus al terminar el torneo. Separa múltiples ganadores con coma.
            </p>
            <p className="text-[#9ca3af] text-xs mb-4">En el futuro estos valores deberían venir del API o un cálculo automático.</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[#7ab88a] text-xs mb-1 block">⚽ Goleador del torneo (nombre exacto)</label>
                <input
                  type="text"
                  value={bonusScorer}
                  onChange={e => setBonusScorer(e.target.value)}
                  placeholder="Lionel Messi"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "white", border: "1px solid #d1d5db", color: "#111827" }}
                />
              </div>
              <div>
                <label className="text-[#7ab88a] text-xs mb-1 block">🎯 Equipo con más goles (nombre exacto)</label>
                <input
                  type="text"
                  value={bonusGoalsTeam}
                  onChange={e => setBonusGoalsTeam(e.target.value)}
                  placeholder="Argentina"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "white", border: "1px solid #d1d5db", color: "#111827" }}
                />
              </div>
              <button
                onClick={evaluateBonus}
                disabled={bonusEvaluating || (!bonusScorer.trim() && !bonusGoalsTeam.trim())}
                className="self-start py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                {bonusEvaluating ? t("admin_evaluating") : "Calcular bonos"}
              </button>
              {bonusEvalMsg && (
                <p className={`text-xs ${bonusEvalMsg.startsWith("Error") ? "text-red-400" : "text-[#F5C518]"}`}>{bonusEvalMsg}</p>
              )}
            </div>
          </div>

          {/* Bloque 3 — Acceso admin */}
          <div className="rounded-2xl p-5" style={cardStyle}>
            <h2 className="text-[#111827] font-bold mb-1">{t("admin_admins_title")}</h2>
            <p className="text-[#6b7280] text-xs mb-4">Usuarios con acceso al panel de admin</p>
            <div className="flex flex-col gap-2 mb-4">
              {admins.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={innerCardStyle}>
                  <span className="text-[#111827] text-sm">{a.email}</span>
                  {a.email !== "apontearnold@gmail.com" ? (
                    <button onClick={() => removeAdmin(a.email)} disabled={adminLoading}
                      className="text-red-400 text-xs hover:text-red-300 font-medium disabled:opacity-50">
                      Eliminar
                    </button>
                  ) : (
                    <span className="text-[#F5C518] text-xs">Principal</span>
                  )}
                </div>
              ))}
              {admins.length === 0 && <p className="text-[#9ca3af] text-xs">Cargando...</p>}
            </div>
            <div className="flex gap-2">
              <input
                type="email" placeholder="nuevo@email.com"
                value={newAdminEmail}
                onChange={e => setNewAdminEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addAdmin()}
                className="flex-1 px-3 py-2 rounded-lg text-[#111827] text-sm"
                style={{ background: "white", border: "1px solid #d1d5db" }}
              />
              <button onClick={addAdmin} disabled={adminLoading || !newAdminEmail.trim()}
                className="py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                {t("admin_add")}
              </button>
            </div>
            {adminMsg && <p className={`mt-2 text-xs ${adminMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{adminMsg}</p>}
          </div>

          {/* Bloque 4 — Herramientas avanzadas */}
          <details className="rounded-2xl overflow-hidden" style={cardStyle}>
            <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between hover:bg-[#f9fafb] transition-colors">
              <span className="text-[#6b7280] font-bold text-sm">🔧 Herramientas avanzadas</span>
              <span className="text-[#9ca3af] text-xs">Solo usar si algo se desincronizó</span>
            </summary>
            <div className="px-5 pb-5 flex flex-col gap-4" style={{ borderTop: "1px solid #e5e7eb" }}>
              <p className="text-[#9ca3af] text-xs pt-4">
                Úsalas solo si hubo una edición manual en la base de datos o si el bracket visual quedó desactualizado.
              </p>

              {/* Recalcular todo */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Recalcular puntos y bracket</p>
                  <p className="text-[#9ca3af] text-xs">Reprocesa todas las predicciones desde cero. Mismo proceso que al guardar un resultado.</p>
                </div>
                <button onClick={recalculateAll} disabled={recalculating}
                  className="flex-shrink-0 py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                  {recalculating ? t("admin_calculating") : t("admin_recalculate_all")}
                </button>
              </div>
              {recalcMsg && <p className={`text-xs ${recalcMsg.startsWith("Error") ? "text-red-400" : "text-[#F5C518]"}`}>{recalcMsg}</p>}

              <div className="h-px bg-[#e5e7eb]" />

              {/* Avanzar bracket */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Avanzar bracket manualmente</p>
                  <p className="text-[#9ca3af] text-xs">Solo actualiza el bracket visual sin recalcular puntos. Usar cuando el bracket quedó desactualizado.</p>
                </div>
                <button onClick={advanceBracket} disabled={advancing}
                  className="flex-shrink-0 py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                  {advancing ? t("admin_calculating") : t("admin_advance_bracket")}
                </button>
              </div>
              {advanceMsg && <p className="text-[#F5C518] text-xs">{advanceMsg}</p>}

              <div className="h-px bg-[#e5e7eb]" />

              {/* Backfill campeones */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Backfill campeones elegidos</p>
                  <p className="text-[#9ca3af] text-xs">Rellena el campeón predicho en quinielas antiguas a partir de sus picks de bracket.</p>
                </div>
                <button onClick={backfillChampions} disabled={backfilling}
                  className="flex-shrink-0 py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                  {backfilling ? "Procesando…" : "Backfill"}
                </button>
              </div>
              {backfillMsg && <p className={`text-xs ${backfillMsg.startsWith("Error") ? "text-red-400" : "text-[#F5C518]"}`}>{backfillMsg}</p>}

              <div className="h-px bg-[#e5e7eb]" />

              {/* Simular torneo completo */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Simular torneo completo</p>
                  <p className="text-[#9ca3af] text-xs">Genera resultados aleatorios para todos los partidos y recalcula puntos. Solo para pruebas — usa &quot;Borrar simulación&quot; para revertir.</p>
                </div>
                {simulateConfirm ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={simulateAll} disabled={simulating}
                      className="py-2 px-4 rounded-lg font-bold text-black text-xs disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                      {simulating ? "Simulando…" : "Confirmar"}
                    </button>
                    <button onClick={() => setSimulateConfirm(false)} disabled={simulating}
                      className="py-2 px-3 rounded-lg text-xs font-medium"
                      style={{ background: "white", border: "1px solid #d1d5db", color: "#6b7280" }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setSimulateConfirm(true)} disabled={simulating}
                    className="flex-shrink-0 py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                    {simulating ? "Simulando…" : "Simular torneo completo"}
                  </button>
                )}
              </div>

              <div className="h-px bg-[#e5e7eb]" />

              {/* Borrar simulación */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Borrar resultados simulados</p>
                  <p className="text-[#9ca3af] text-xs">Borra scores marcados como &quot;simulation&quot;. Los datos de equipos y grupos no se tocan.</p>
                </div>
                {clearSimConfirm ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={clearSimulation} disabled={clearingSimulation}
                      className="py-2 px-4 rounded-lg font-bold text-white text-xs disabled:opacity-50"
                      style={{ background: "#dc2626" }}>
                      {clearingSimulation ? "Borrando…" : "Confirmar"}
                    </button>
                    <button onClick={() => setClearSimConfirm(false)}
                      className="py-2 px-3 rounded-lg text-xs font-medium"
                      style={{ background: "white", border: "1px solid #d1d5db", color: "#6b7280" }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setClearSimConfirm(true)} disabled={clearingSimulation}
                    className="flex-shrink-0 py-2 px-4 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background: "white", border: "1px solid #fca5a5", color: "#dc2626" }}>
                    {clearingSimulation ? "Borrando…" : "Borrar simulación"}
                  </button>
                )}
              </div>
              {simMsg && (
                <p className="text-xs" style={{ color: simMsg.ok ? "#15803d" : "#dc2626" }}>{simMsg.text}</p>
              )}

              <div className="h-px bg-[#e5e7eb]" />

              {/* Fixtures placeholder de eliminatoria */}
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[#111827] text-sm font-medium">Fixtures de eliminatoria (pruebas)</p>
                  <p className="text-[#9ca3af] text-xs">Para probar el torneo completo antes de que API-Football publique los partidos reales. Crea 32 fixtures placeholder con bracket_position para todas las fases knockout.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={createBracketFixtures} disabled={creatingPlaceholders || cleaningPlaceholders}
                    className="py-2 px-4 rounded-lg font-bold text-black text-xs uppercase disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                    {creatingPlaceholders ? "Creando…" : "Crear partidos de eliminatoria"}
                  </button>
                  <button onClick={cleanBracketFixtures} disabled={cleaningPlaceholders || creatingPlaceholders}
                    className="py-2 px-4 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background: "white", border: "1px solid #fca5a5", color: "#dc2626" }}>
                    {cleaningPlaceholders ? "Limpiando…" : "Limpiar placeholders"}
                  </button>
                </div>
                {createPlaceholderMsg && (
                  <p className={`text-xs ${createPlaceholderMsg.startsWith("Error") ? "text-red-400" : "text-[#F5C518]"}`}>{createPlaceholderMsg}</p>
                )}
                {cleanPlaceholderMsg && (
                  <p className={`text-xs ${cleanPlaceholderMsg.startsWith("Error") ? "text-red-400" : "text-[#15803d]"}`}>{cleanPlaceholderMsg}</p>
                )}
              </div>
            </div>
          </details>

        </div>
      )}

      {/* ── SNAPSHOTS ──────────────────────────────────────────────────────────── */}
      {activeTab === "snapshots" && <SnapshotsPanel />}

      {/* ── PAGOS ──────────────────────────────────────────────────────────── */}
      {activeTab === "pagos" && <PaymentsPanel />}
    </div>
  )
}

function DiagRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-[#4a7a5a] w-20 flex-shrink-0">{label}:</span>
      <span className={ok ? "text-white" : "text-red-400"}>{value}</span>
    </div>
  )
}

