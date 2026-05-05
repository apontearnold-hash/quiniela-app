"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase-browser"
import type { Fixture, Prediction, BracketPick, Phase } from "@/lib/types"
import { PHASE_LABELS, PHASE_MULTIPLIER } from "@/lib/types"
import {
  computeGroupStandings,
  computeBest3rd,
  resolveKnockoutBracket,
  determineKnockoutWinner,
  type ProjectedTeam,
  type ResolvedBracket,
} from "@/lib/bracket-projection"
import { isBracketSlotId, slotKeyById } from "@/lib/bracket-slots"

const ALL_PHASES: Phase[] = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]

// ── Types ──────────────────────────────────────────────────────────────────────
interface Props {
  quinielaId: string
  allFixtures: Fixture[]                          // group fixtures (API) + bracket slot fixtures (static)
  existingPredictions: Record<number, Prediction> // group picks, keyed by fixture_id
  existingBracketPicks: Record<string, BracketPick> // knockout picks, keyed by slot_key
  quinielaStatus: "draft" | "submitted"
  lockDate: string | null
  readOnly?: boolean
  /** Saved bonus picks — used for submit completeness check */
  bonusPicks?: { topScorer: string | null; mostGoalsTeam: string | null }
  poolPrice?: number
  poolCurrency?: string
  poolPrizeType?: "money" | "physical"
  poolPrize1st?: string | null
  poolPrize2nd?: string | null
  poolPrize3rd?: string | null
  /** Already-submitted count in this pool; +1 is shown to reflect this submission */
  submittedCount?: number
  /** Pool flag: admin has reopened knockout editing post-lock */
  knockoutEditable?: boolean
  /** Real fixture status per bracket_position / slot_key — used to lock started games */
  knockoutStatusMap?: Record<string, string>
  /** Real knockout fixtures keyed by bracket_position — overlaid on static slots to provide team IDs */
  realKnockoutFixtures?: Record<string, Fixture>
  /** True when R32 has real teams and this quiniela's picks need to be synced */
  r32NeedsSync?: boolean
}

interface PredState {
  home: string
  away: string
  predicts_penalties: boolean
  penalties_winner: string
  saving: boolean
  saved: boolean
  error: string | null
}

// ── Knockout draw validation ───────────────────────────────────────────────────
function knockoutDrawError(phase: Phase | null | undefined, pred: PredState | undefined): string | null {
  if (!phase || phase === "groups") return null
  if (!pred || pred.home === "" || pred.away === "") return null
  const h = parseInt(pred.home), a = parseInt(pred.away)
  if (isNaN(h) || isNaN(a) || h !== a) return null
  // Tied knockout: penalties are assumed — only error if winner not chosen
  if (!pred.penalties_winner) return "Selecciona quién gana en penales"
  return null
}

// ── Phase header ───────────────────────────────────────────────────────────────
function PhaseHeader({ phase }: { phase: Phase }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest whitespace-nowrap">
        {PHASE_LABELS[phase]}
      </h2>
      <div className="flex-1 h-px" style={{ background: "#3a6a4a" }} />
      <span className="text-[#a0d0b0] text-xs px-2 py-0.5 rounded-full font-bold"
        style={{ background: "#1a3a22", border: "1px solid #2a5438" }}>
        ×{PHASE_MULTIPLIER[phase]}
      </span>
    </div>
  )
}

// ── Projected standings table ──────────────────────────────────────────────────
function ProjectedStandingsTable({ standings, best3rdIds }: { standings: ProjectedTeam[]; best3rdIds: Set<number> }) {
  return (
    <div className="rounded-xl overflow-hidden text-xs" style={{ background: "rgba(10,18,8,0.8)", border: "1px solid #1a3322" }}>
      <div className="grid grid-cols-[16px_1fr_20px_22px_16px] gap-1 px-2 py-1.5 font-bold uppercase tracking-wider" style={{ background: "#0d1f11", color: "#7ab88a" }}>
        <span>#</span><span>Equipo</span>
        <span className="text-center">GD</span>
        <span className="text-center">Pts</span>
        <span />
      </div>
      {standings.map((team, idx) => {
        const pos = idx + 1
        const isClassified = pos <= 2  // direct qualification
        const isMaybe      = pos === 3 // best-third candidate
        const hasData      = team.played > 0

        // Qualification indicator:
        //   pos 1–2: always ↑ (direct)
        //   pos 3:   ↑ if in best-8, ↓ if not, ? if no matches predicted yet
        //   pos 4:   ↓ (never qualifies) once there's data, blank otherwise
        const indicator = isClassified
          ? "↑"
          : isMaybe
            ? hasData ? (best3rdIds.has(team.teamId) ? "↑" : "↓") : "?"
            : hasData ? "↓" : ""

        const indicatorColor = isClassified
          ? "#4ade80"
          : isMaybe
            ? hasData ? (best3rdIds.has(team.teamId) ? "#4ade80" : "#f87171") : "#F5C518"
            : "#f87171"

        return (
          <div key={team.teamId} className="grid grid-cols-[16px_1fr_20px_22px_16px] gap-1 px-2 py-1.5 border-t border-[#0d1f11] items-center"
            style={{ background: isClassified ? "rgba(42,122,74,0.15)" : isMaybe ? "rgba(245,197,24,0.04)" : "transparent" }}>
            <span className="font-bold text-center leading-none" style={{ color: isClassified ? "#4ade80" : isMaybe ? "#F5C518" : "#4a7a5a" }}>{pos}</span>
            <div className="flex items-center gap-1 min-w-0">
              {team.teamFlag && <img src={team.teamFlag} alt="" className="w-4 h-3 object-contain flex-shrink-0" />}
              <span className="truncate leading-none" style={{ color: isClassified ? "#e2e8f0" : "#6b7280" }}>
                {team.teamName.length > 11 ? `${team.teamName.slice(0, 10)}…` : team.teamName}
              </span>
            </div>
            <span className="text-center leading-none" style={{ color: team.gd > 0 ? "#4ade80" : team.gd < 0 ? "#f87171" : "#6b7280" }}>
              {team.gd > 0 ? `+${team.gd}` : team.gd}
            </span>
            <span className="text-center font-black leading-none" style={{ color: "#F5C518" }}>{team.pts}</span>
            <span className="text-center leading-none font-bold" style={{ color: indicatorColor }}>
              {indicator}
            </span>
          </div>
        )
      })}
      {standings.length === 0 && (
        <p className="text-[#2a5438] text-xs text-center py-3">Ingresa resultados</p>
      )}
    </div>
  )
}

// ── Compact group row ──────────────────────────────────────────────────────────
function CompactGroupRow({ fixture, pred, isLocked, onUpdate, onSave }: {
  fixture: Fixture; pred: PredState; isLocked: boolean
  onUpdate: (id: number, field: keyof PredState, value: string | boolean) => void
  onSave: (f: Fixture) => void
}) {
  const finished = fixture.home_score !== null
  const filled   = pred?.home !== "" && pred?.away !== ""
  const editable = !isLocked

  return (
    <div className="rounded-lg px-2.5 py-2 flex flex-col gap-1.5"
      style={{ background: "rgba(10,18,8,0.75)", border: `1px solid ${filled ? "#2a7a4a" : "#2a5438"}` }}>

      {/* Top row: date + actual result + status */}
      <div className="flex items-center justify-between">
        <Link
          href={`/fixtures/${fixture.id}`}
          className="text-[#9ab8a0] hover:text-[#F5C518] text-xs font-medium transition-colors"
          title="Ver detalles"
          tabIndex={-1}
        >
          {fixture.kickoff
            ? new Date(fixture.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
            : "—"}
        </Link>
        <div className="flex items-center gap-1">
          {finished && (
            <span className="text-[#7ab88a] text-xs font-bold">
              {fixture.home_score}–{fixture.away_score}
            </span>
          )}
          {pred?.saving && <span className="text-[#7ab88a] text-[10px]">…</span>}
          {pred?.saved && !pred?.saving && <span className="text-green-400 text-[10px]">✓</span>}
          {pred?.error && <span className="text-red-400 text-[10px]" title={pred.error ?? ""}>!</span>}
          {isLocked && !finished && <span className="text-orange-400 text-[10px]">🔒</span>}
        </div>
      </div>

      {/* Match row: home — inputs — away */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
          <span className="text-white text-xs font-semibold truncate leading-tight">
            {fixture.home_team_name ?? "—"}
          </span>
          {fixture.home_team_flag
            ? <img src={fixture.home_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
            : <span className="text-sm flex-shrink-0">{countryEmoji(fixture.home_team_code)}</span>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number" min="0" max="20"
            value={pred?.home ?? ""}
            onChange={e => onUpdate(fixture.id, "home", e.target.value)}
            onBlur={() => onSave(fixture)}
            disabled={!editable}
            inputMode="numeric"
            className="w-10 h-10 text-center text-white text-base font-black rounded-lg outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "rgba(0,0,0,0.5)", border: filled ? "1px solid #2a7a4a" : "1px solid #2a5438" }}
            placeholder="–"
          />
          <span className="text-[#4a7a5a] text-xs font-bold">:</span>
          <input
            type="number" min="0" max="20"
            value={pred?.away ?? ""}
            onChange={e => onUpdate(fixture.id, "away", e.target.value)}
            onBlur={() => onSave(fixture)}
            disabled={!editable}
            inputMode="numeric"
            className="w-10 h-10 text-center text-white text-base font-black rounded-lg outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "rgba(0,0,0,0.5)", border: filled ? "1px solid #2a7a4a" : "1px solid #2a5438" }}
            placeholder="–"
          />
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          {fixture.away_team_flag
            ? <img src={fixture.away_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
            : <span className="text-sm flex-shrink-0">{countryEmoji(fixture.away_team_code)}</span>}
          <span className="text-white text-xs font-semibold truncate leading-tight">
            {fixture.away_team_name ?? "—"}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Bracket match card (knockout phases) ───────────────────────────────────────
function BracketMatchCard({ fixture, pred, isLocked, proj, onUpdate, onSave }: {
  fixture: Fixture
  pred: PredState
  isLocked: boolean
  proj?: ResolvedBracket[number]
  onUpdate: (id: number, field: keyof PredState, value: string | boolean) => void
  onSave: (f: Fixture) => void
}) {
  const editable   = !isLocked
  const finished   = fixture.home_score !== null
  const filled     = pred?.home !== "" && pred?.away !== ""
  const isDraw     = filled && parseInt(pred?.home) === parseInt(pred?.away) && !isNaN(parseInt(pred?.home))
  const drawErr    = knockoutDrawError(fixture.phase, pred)
  const hasError   = drawErr !== null

  const homeName   = fixture.home_team_name ?? proj?.homeName ?? fixture.home_placeholder ?? "TBD"
  const awayName   = fixture.away_team_name ?? proj?.awayName ?? fixture.away_placeholder ?? "TBD"
  const homeFlag   = fixture.home_team_flag ?? proj?.homeFlag ?? null
  const awayFlag   = fixture.away_team_flag ?? proj?.awayFlag ?? null
  const homeIsProj = !fixture.home_team_name && (proj?.homeIsProjected ?? true)
  const awayIsProj = !fixture.away_team_name && (proj?.awayIsProjected ?? true)

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s

  // Auto-sync predicts_penalties with draw state so the DB value stays correct
  useEffect(() => {
    if (!editable) return
    if (isDraw && !pred?.predicts_penalties) {
      onUpdate(fixture.id, "predicts_penalties", true)
    } else if (!isDraw && pred?.predicts_penalties) {
      onUpdate(fixture.id, "predicts_penalties", false)
      if (pred.penalties_winner) onUpdate(fixture.id, "penalties_winner", "")
    }
  }, [isDraw]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScore(field: "home" | "away", val: string) {
    onUpdate(fixture.id, field, val)
    const hv = field === "home" ? val : (pred?.home ?? "")
    const av = field === "away" ? val : (pred?.away ?? "")
    if (hv !== "" && av !== "") {
      const h = parseInt(hv), a = parseInt(av)
      if (!isNaN(h) && !isNaN(a)) {
        if (h === a) {
          if (!pred?.predicts_penalties) onUpdate(fixture.id, "predicts_penalties", true)
        } else if (pred?.predicts_penalties) {
          onUpdate(fixture.id, "predicts_penalties", false)
          if (pred.penalties_winner) onUpdate(fixture.id, "penalties_winner", "")
        }
      }
    }
  }

  // Identical input style to group-stage cards
  const inputCls = "w-10 h-9 text-center text-white text-base font-black rounded-lg outline-none disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
  // Projected teams dimmed but still white-toned; confirmed teams pure white
  const nameColor = (isProj: boolean) => isProj ? "#cbd5e1" : "#f1f5f9"

  return (
    <div className="w-40 rounded-lg px-2.5 py-2 flex flex-col gap-1.5 flex-shrink-0"
      style={{
        background: "rgba(10,18,8,0.8)",
        border: hasError ? "1px solid #ef4444" : filled ? "1px solid #2a7a4a" : "1px solid #2a5438",
      }}>

      {/* Slot ID + status — same top-row pattern as group cards */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold" style={{ color: "#7ab88a" }}>
          {fixture.bracket_position ?? ""}
        </span>
        <span className="flex items-center gap-0.5">
          {isLocked && !finished && <span className="text-orange-400 text-[10px]">🔒</span>}
          {finished  && <span className="text-[#7ab88a] text-[10px]">✓</span>}
          {pred?.saving && <span className="text-[#7ab88a] text-[10px]">…</span>}
          {pred?.saved && !pred?.saving && <span className="text-green-400 text-[10px]">✓</span>}
          {hasError && !pred?.saving && <span className="text-red-400 text-[10px]" title={drawErr ?? ""}>⚠</span>}
        </span>
      </div>

      {/* Home row — flag + name + score box, same metrics as group cards */}
      <div className="flex items-center gap-1.5">
        {homeFlag
          ? <img src={homeFlag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm"
              style={{ opacity: homeIsProj ? 0.5 : 1 }} />
          : <span className="flex-shrink-0 text-sm" style={{ opacity: homeIsProj ? 0.5 : 1 }}>
              {countryEmoji(fixture.home_team_code)}
            </span>}
        <span className="flex-1 text-xs font-semibold truncate min-w-0 leading-tight"
          style={{ color: nameColor(homeIsProj) }}>
          {truncate(homeName, 11)}
        </span>
        <input type="number" min="0" max="99" value={pred?.home ?? ""}
          onChange={e => handleScore("home", e.target.value)}
          onBlur={() => onSave(fixture)}
          disabled={!editable}
          inputMode="numeric"
          className={inputCls}
          style={{ background: "rgba(0,0,0,0.5)", border: filled ? "1px solid #2a7a4a" : "1px solid #2a5438" }}
          placeholder="–"
        />
      </div>

      {/* Away row */}
      <div className="flex items-center gap-1.5">
        {awayFlag
          ? <img src={awayFlag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm"
              style={{ opacity: awayIsProj ? 0.5 : 1 }} />
          : <span className="flex-shrink-0 text-sm" style={{ opacity: awayIsProj ? 0.5 : 1 }}>
              {countryEmoji(fixture.away_team_code)}
            </span>}
        <span className="flex-1 text-xs font-semibold truncate min-w-0 leading-tight"
          style={{ color: nameColor(awayIsProj) }}>
          {truncate(awayName, 11)}
        </span>
        <input type="number" min="0" max="99" value={pred?.away ?? ""}
          onChange={e => handleScore("away", e.target.value)}
          onBlur={() => onSave(fixture)}
          disabled={!editable}
          inputMode="numeric"
          className={inputCls}
          style={{ background: "rgba(0,0,0,0.5)", border: filled ? "1px solid #2a7a4a" : "1px solid #2a5438" }}
          placeholder="–"
        />
      </div>

      {/* Tied + editable: penalty winner selector, no checkbox */}
      {isDraw && editable && (
        <div className="pt-1 mt-0.5 border-t border-[#2a5438] flex flex-col gap-1">
          <p className="text-[10px] font-medium" style={{ color: "#7ab88a" }}>
            ¿Quién gana en penales? <span style={{ color: "#F5C518" }}>+3</span>
          </p>
          <div className="flex gap-1">
            {(["home", "away"] as const).map(side => (
              <button key={side} type="button"
                onClick={() => { onUpdate(fixture.id, "penalties_winner", side); onSave(fixture) }}
                className="flex-1 rounded-md transition-all text-[10px] font-semibold"
                style={{
                  padding: "3px 0",
                  background: pred?.penalties_winner === side ? "#F5C518" : "rgba(255,255,255,0.05)",
                  color: pred?.penalties_winner === side ? "#000" : "#e2e8f0",
                  border: `1px solid ${pred?.penalties_winner === side ? "#F5C518" : "#2a5438"}`,
                  fontWeight: pred?.penalties_winner === side ? 700 : 500,
                }}
              >
                {side === "home"
                  ? truncate(fixture.home_team_name ?? homeName, 5)
                  : truncate(fixture.away_team_name ?? awayName, 5)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tied + readOnly: display penalty winner */}
      {isDraw && !editable && pred?.penalties_winner && (
        <div className="pt-1 mt-0.5 border-t border-[#2a5438] text-center text-[10px]"
          style={{ color: "#F5C518" }}>
          🥅 {pred.penalties_winner === "home"
            ? truncate(fixture.home_team_name ?? homeName, 10)
            : truncate(fixture.away_team_name ?? awayName, 10)}
        </div>
      )}

      {/* Error */}
      {hasError && (
        <p className="text-red-400 text-[10px] leading-tight">{drawErr}</p>
      )}
    </div>
  )
}

// ── Country emoji fallback ─────────────────────────────────────────────────────
function countryEmoji(code: string | null): string {
  if (!code || code.length !== 3) return "🏳️"
  const map: Record<string, string> = {
    MEX: "🇲🇽", USA: "🇺🇸", CAN: "🇨🇦", BRA: "🇧🇷", ARG: "🇦🇷",
    FRA: "🇫🇷", ESP: "🇪🇸", GER: "🇩🇪", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", POR: "🇵🇹",
    NED: "🇳🇱", ITA: "🇮🇹", BEL: "🇧🇪", URU: "🇺🇾", COL: "🇨🇴",
    CHI: "🇨🇱", ECU: "🇪🇨", PER: "🇵🇪", BOL: "🇧🇴", VEN: "🇻🇪",
    PAR: "🇵🇾", JPN: "🇯🇵", KOR: "🇰🇷", AUS: "🇦🇺", MAR: "🇲🇦",
    SEN: "🇸🇳", NGA: "🇳🇬", CMR: "🇨🇲", GHA: "🇬🇭", EGY: "🇪🇬",
    SAU: "🇸🇦", IRN: "🇮🇷", QAT: "🇶🇦", CRO: "🇭🇷", SRB: "🇷🇸",
    DEN: "🇩🇰", SUI: "🇨🇭", POL: "🇵🇱", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  }
  return map[code] ?? "🏳️"
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PredictionsEditor({
  quinielaId, allFixtures, existingPredictions, existingBracketPicks, quinielaStatus, lockDate, readOnly = false,
  bonusPicks = { topScorer: null, mostGoalsTeam: null },
  poolPrice, poolCurrency, poolPrizeType = "money", poolPrize1st, poolPrize2nd, poolPrize3rd,
  submittedCount = 0,
  knockoutEditable = false, knockoutStatusMap = {},
  realKnockoutFixtures = {},
  r32NeedsSync = false,
}: Props) {
  const supabase = createClient()

  const isLocked = lockDate ? Date.now() >= new Date(lockDate).getTime() : false
  const effectiveLock = isLocked || readOnly

  // When knockoutEditable: groups stay locked, only not_started bracket slots are editable
  const canEdit = !effectiveLock || (knockoutEditable && !readOnly)
  function isFixtureLocked(f: Fixture): boolean {
    if (!effectiveLock) return false
    if (!(knockoutEditable && !readOnly)) return true
    if (!isBracketSlotId(f.id)) return true
    const slotKey = slotKeyById(f.id)
    if (!slotKey) return true
    return (knockoutStatusMap[slotKey] ?? "not_started") !== "not_started"
  }

  const [preds, setPreds] = useState<Record<number, PredState>>(() => {
    const init: Record<number, PredState> = {}
    allFixtures.forEach(f => {
      if (isBracketSlotId(f.id)) {
        // Knockout slot — look up by slot_key in bracket_picks
        const key = slotKeyById(f.id)
        const bp = key ? existingBracketPicks[key] : undefined
        init[f.id] = {
          home: bp?.home_score_pred?.toString() ?? "",
          away: bp?.away_score_pred?.toString() ?? "",
          predicts_penalties: bp?.predicts_penalties ?? false,
          penalties_winner: bp?.penalties_winner ?? "",
          saving: false, saved: false, error: null,
        }
      } else {
        // Group fixture — look up by fixture_id in predictions
        const e = existingPredictions[f.id]
        init[f.id] = {
          home: e?.home_score_pred?.toString() ?? "",
          away: e?.away_score_pred?.toString() ?? "",
          predicts_penalties: e?.predicts_penalties ?? false,
          penalties_winner: e?.penalties_winner ?? "",
          saving: false, saved: false, error: null,
        }
      }
    })
    return init
  })
  // Always-current ref so savePred reads latest preds even when called
  // from a stale onBlur closure (React 18 automatic batching means the
  // onChange re-render may not have committed before onBlur fires).
  const predsRef = useRef(preds)
  predsRef.current = preds

  const [status, setStatus]           = useState<"draft" | "submitted">(quinielaStatus)
  const [showConfirm, setShowConfirm]  = useState(false)
  const [submitting, setSubmitting]    = useState(false)
  const [submitError, setSubmitError]  = useState<string | null>(null)
  const [isDirty, setIsDirty]          = useState(false)
  const [isSaving, setIsSaving]        = useState(false)
  // R32 sync modal — shown once per page load when r32NeedsSync=true
  const [showR32Modal, setShowR32Modal] = useState(r32NeedsSync)
  const [r32Syncing, setR32Syncing]     = useState(false)
  const [r32SyncError, setR32SyncError] = useState<string | null>(null)
  const [draftResult, setDraftResult]  = useState<"ok" | "error" | null>(null)
  const [draftError, setDraftError]    = useState<string | null>(null)

  // ── Merge real team IDs from confirmed knockout fixtures onto static slots ────
  const allFixturesMerged = useMemo(() => {
    if (Object.keys(realKnockoutFixtures).length === 0) return allFixtures
    return allFixtures.map(f => {
      if (!f.bracket_position) return f
      const real = realKnockoutFixtures[f.bracket_position]
      if (!real) return f
      return {
        ...f,
        home_team_id:   real.home_team_id,
        home_team_name: real.home_team_name,
        home_team_flag: real.home_team_flag,
        away_team_id:   real.away_team_id,
        away_team_name: real.away_team_name,
        away_team_flag: real.away_team_flag,
      }
    })
  }, [allFixtures, realKnockoutFixtures])

  // ── Fixtures by phase ────────────────────────────────────────────────────────
  const byPhase = useMemo(() => {
    const map: Partial<Record<Phase, Fixture[]>> = {}
    ALL_PHASES.forEach(p => { map[p] = [] })
    allFixturesMerged.forEach(f => { if (f.phase && map[f.phase]) map[f.phase]!.push(f) })
    return map
  }, [allFixturesMerged])

  // ── Projected group standings ────────────────────────────────────────────────
  const groupProjections = useMemo(() => {
    const proj = new Map<string, ProjectedTeam[]>()
    const gMap = new Map<string, Fixture[]>()
    ;(byPhase.groups ?? []).forEach(f => {
      const gn = f.group_name ?? "Sin Grupo"
      if (!gMap.has(gn)) gMap.set(gn, [])
      gMap.get(gn)!.push(f)
    })
    gMap.forEach((fixtures, gn) => proj.set(gn, computeGroupStandings(fixtures, preds, gn)))
    return proj
  }, [byPhase.groups, preds])

  const best3rd = useMemo(() => computeBest3rd(groupProjections), [groupProjections])

  const best3rdIds = useMemo(() => new Set(best3rd.map(t => t.teamId)), [best3rd])

  // Dev console logging — stripped in production
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    console.groupCollapsed("[best3rd] qualification debug")

    groupProjections.forEach((standings, gn) => {
      const groupFs = (byPhase.groups ?? []).filter(f => f.group_name === gn)
      const filled  = groupFs.filter(f => preds[f.id]?.home !== "" && preds[f.id]?.away !== "").length
      const third   = standings[2]
      console.log(
        `  ${gn}: 3rd = ${third?.teamName ?? "?"} | ${third?.pts ?? 0}pts GD${third?.gd ?? 0} GF${third?.goalsFor ?? 0} | ${filled}/${groupFs.length} predicted`,
      )
    })

    const allThirds: ProjectedTeam[] = []
    groupProjections.forEach(s => { if (s.length >= 3) allThirds.push(s[2]) })
    allThirds.sort(
      (a, b) => b.pts - a.pts || b.gd - a.gd || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName),
    )
    console.log("[best3rd] All thirds ranked (best→worst):")
    allThirds.forEach((t, i) =>
      console.log(
        `  ${i + 1}. ${t.teamName} (${t.groupName}) ${t.pts}pts GD${t.gd} GF${t.goalsFor} → qualified: ${best3rdIds.has(t.teamId)}`,
      ),
    )
    console.log("[best3rd] Top 8 qualifiers:", best3rd.map(t => t.teamName))
    console.groupEnd()
  }, [groupProjections, best3rd, best3rdIds, byPhase.groups, preds])

  const projectedBracket = useMemo(
    () => resolveKnockoutBracket(byPhase, groupProjections, best3rd, preds),
    [byPhase, groupProjections, best3rd, preds]
  )
  // Kept in a ref so savePred (stale useCallback) always reads the latest value
  const projectedBracketRef = useRef(projectedBracket)
  projectedBracketRef.current = projectedBracket

  // Derive the projected World Cup champion from the final bracket pick
  const champion = useMemo<{ name: string; flag: string | null } | null>(() => {
    const finalFix = (byPhase.final ?? [])[0]
    if (!finalFix) return null
    const proj = projectedBracket[finalFix.id]
    const pred = preds[finalFix.id]
    if (!proj || !pred || pred.home === "" || pred.away === "") return null
    const h = parseInt(pred.home), a = parseInt(pred.away)
    if (isNaN(h) || isNaN(a)) return null
    const winner = determineKnockoutWinner(h, a, pred.predicts_penalties, pred.penalties_winner ?? null)
    if (winner === "home") return { name: proj.homeName, flag: proj.homeFlag }
    if (winner === "away") return { name: proj.awayName, flag: proj.awayFlag }
    return null
  }, [byPhase.final, projectedBracket, preds])

  // Sync projected champion to quinielas table whenever it changes (debounced, only after user edits)
  useEffect(() => {
    if (!isDirty) return
    const timeout = setTimeout(() => {
      supabase.from("quinielas").update({
        champion_team_name: champion?.name ?? null,
        champion_team_flag: champion?.flag ?? null,
      }).eq("id", quinielaId)
    }, 800)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champion, isDirty])

  // ── Save (upsert — idempotent) ───────────────────────────────────────────────
  const updatePred = useCallback((fixtureId: number, field: keyof PredState, value: string | boolean) => {
    setPreds(prev => ({ ...prev, [fixtureId]: { ...prev[fixtureId], [field]: value, saved: false, error: null } }))
    setIsDirty(true)
  }, [])

  const savePred = useCallback(async (fixture: Fixture) => {
    const pred = predsRef.current[fixture.id]
    if (!pred) return
    const hv = pred.home.trim(), av = pred.away.trim()
    if (hv === "" || av === "") return
    const h = parseInt(hv, 10), a = parseInt(av, 10)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], error: "Inválido" } }))
      return
    }
    const drawErr = knockoutDrawError(fixture.phase, pred)
    if (drawErr !== null) {
      setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], error: drawErr } }))
      return
    }
    setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: true, error: null } }))

    let error: { message: string } | null = null

    if (isBracketSlotId(fixture.id)) {
      // Knockout bracket pick → bracket_picks table
      const slot_key = slotKeyById(fixture.id)
      if (!slot_key) {
        setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: false, error: "Slot inválido" } }))
        return
      }
      // Capture team IDs: prefer real fixture IDs, fall back to projected
      const proj = projectedBracketRef.current[fixture.id]
      const homeTeamId   = fixture.home_team_id   ?? proj?.homeId   ?? null
      const awayTeamId   = fixture.away_team_id   ?? proj?.awayId   ?? null
      const homeTeamName = fixture.home_team_name ?? proj?.homeName ?? null
      const awayTeamName = fixture.away_team_name ?? proj?.awayName ?? null
      const homeTeamFlag = fixture.home_team_flag ?? proj?.homeFlag ?? null
      const awayTeamFlag = fixture.away_team_flag ?? proj?.awayFlag ?? null
      const res = await supabase.from("bracket_picks").upsert(
        {
          quiniela_id: quinielaId, slot_key,
          home_score_pred: h, away_score_pred: a,
          predicts_penalties: pred.predicts_penalties, penalties_winner: pred.penalties_winner || null,
          home_team_id_pred: homeTeamId, away_team_id_pred: awayTeamId,
          home_team_name_pred: homeTeamName, away_team_name_pred: awayTeamName,
          home_team_flag_pred: homeTeamFlag, away_team_flag_pred: awayTeamFlag,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "quiniela_id,slot_key" }
      )
      error = res.error
    } else {
      // Group fixture pick → predictions table
      const res = await supabase.from("predictions").upsert(
        { quiniela_id: quinielaId, fixture_id: fixture.id, home_score_pred: h, away_score_pred: a, predicts_penalties: pred.predicts_penalties, penalties_winner: pred.penalties_winner || null },
        { onConflict: "quiniela_id,fixture_id" }
      )
      error = res.error
    }

    setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], saving: false, saved: !error, error: error?.message ?? null } }))
  }, [quinielaId, supabase])

  // ── Save draft (bulk upsert — groups → predictions, knockout → bracket_picks) ─
  const saveAllPreds = useCallback(async () => {
    const current = predsRef.current
    setIsSaving(true)
    setDraftResult(null)
    setDraftError(null)

    type PredRow = { quiniela_id: string; fixture_id: number; home_score_pred: number; away_score_pred: number; predicts_penalties: boolean; penalties_winner: string | null }
    type BpRow   = {
      quiniela_id: string; slot_key: string
      home_score_pred: number; away_score_pred: number
      predicts_penalties: boolean; penalties_winner: string | null
      home_team_id_pred: number | null; away_team_id_pred: number | null
      home_team_name_pred: string | null; away_team_name_pred: string | null
      home_team_flag_pred: string | null; away_team_flag_pred: string | null
      updated_at: string
    }

    const predRows: PredRow[] = []
    const bpRows:   BpRow[]   = []
    let hasDrawErrors = false
    const projBracket = projectedBracketRef.current

    for (const fixture of allFixturesMerged) {
      const pred = current[fixture.id]
      if (!pred) continue
      const hv = pred.home.trim(), av = pred.away.trim()
      if (hv === "" || av === "") continue
      const h = parseInt(hv, 10), a = parseInt(av, 10)
      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) continue

      const drawErr = knockoutDrawError(fixture.phase, pred)
      if (drawErr !== null) {
        setPreds(prev => ({ ...prev, [fixture.id]: { ...prev[fixture.id], error: drawErr } }))
        hasDrawErrors = true
        continue
      }

      if (isBracketSlotId(fixture.id)) {
        const slot_key = slotKeyById(fixture.id)
        if (!slot_key) continue
        const proj = projBracket[fixture.id]
        bpRows.push({
          quiniela_id: quinielaId, slot_key,
          home_score_pred: h, away_score_pred: a,
          predicts_penalties: pred.predicts_penalties, penalties_winner: pred.penalties_winner || null,
          home_team_id_pred:   fixture.home_team_id   ?? proj?.homeId   ?? null,
          away_team_id_pred:   fixture.away_team_id   ?? proj?.awayId   ?? null,
          home_team_name_pred: fixture.home_team_name ?? proj?.homeName ?? null,
          away_team_name_pred: fixture.away_team_name ?? proj?.awayName ?? null,
          home_team_flag_pred: fixture.home_team_flag ?? proj?.homeFlag ?? null,
          away_team_flag_pred: fixture.away_team_flag ?? proj?.awayFlag ?? null,
          updated_at: new Date().toISOString(),
        })
      } else {
        predRows.push({ quiniela_id: quinielaId, fixture_id: fixture.id, home_score_pred: h, away_score_pred: a, predicts_penalties: pred.predicts_penalties, penalties_winner: pred.penalties_winner || null })
      }
    }

    if (predRows.length === 0 && bpRows.length === 0) {
      setIsSaving(false)
      setDraftResult("error")
      setDraftError(hasDrawErrors ? "Resuelve los empates en eliminatorias." : "No hay predicciones que guardar.")
      return
    }

    // Run both upserts; collect first error
    const [predRes, bpRes] = await Promise.all([
      predRows.length > 0
        ? supabase.from("predictions").upsert(predRows, { onConflict: "quiniela_id,fixture_id" })
        : Promise.resolve({ error: null }),
      bpRows.length > 0
        ? supabase.from("bracket_picks").upsert(bpRows, { onConflict: "quiniela_id,slot_key" })
        : Promise.resolve({ error: null }),
    ])

    setIsSaving(false)
    const saveError = predRes.error ?? bpRes.error

    if (saveError) {
      setDraftResult("error")
      setDraftError(saveError.message)
    } else {
      const total = predRows.length + bpRows.length
      setPreds(prev => {
        const next = { ...prev }
        predRows.forEach(r => { next[r.fixture_id] = { ...next[r.fixture_id], saved: true, error: null } })
        bpRows.forEach(r => {
          const slot = allFixturesMerged.find(f => slotKeyById(f.id) === r.slot_key)
          if (slot) next[slot.id] = { ...next[slot.id], saved: true, error: null }
        })
        return next
      })
      setIsDirty(hasDrawErrors)
      setDraftResult("ok")
      setDraftError(hasDrawErrors ? `${total} predicciones guardadas · resuelve empates pendientes.` : null)
      setTimeout(() => setDraftResult(null), 4000)
    }
  }, [quinielaId, supabase, allFixturesMerged])

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true); setSubmitError(null)
    const res = await fetch(`/api/quiniela/${quinielaId}/submit`, { method: "POST" })
    if (res.ok) { setStatus("submitted"); setShowConfirm(false); setIsDirty(false) }
    else { const d = await res.json().catch(() => ({})); setSubmitError(d.error ?? "Error al enviar") }
    setSubmitting(false)
  }

  // ── Submission gate ───────────────────────────────────────────────────────────
  const groupFixtures   = byPhase.groups ?? []
  const groupFilled     = groupFixtures.filter(f => preds[f.id]?.home !== "" && preds[f.id]?.away !== "").length
  const groupTotal      = groupFixtures.length

  const knockoutFixtures = allFixturesMerged.filter(f => f.phase && f.phase !== "groups")
  const knockoutFilled   = knockoutFixtures.filter(f => preds[f.id]?.home !== "" && preds[f.id]?.away !== "").length
  const knockoutTotal    = knockoutFixtures.length

  const invalidKnockoutCount = knockoutFixtures
    .filter(f => knockoutDrawError(f.phase, preds[f.id]) !== null)
    .length

  // Build an ordered list of what's still missing
  const missingItems: string[] = []
  if (groupTotal > 0 && groupFilled < groupTotal) {
    const n = groupTotal - groupFilled
    missingItems.push(`${n} partido${n > 1 ? "s" : ""} de grupos sin completar`)
  }
  if (knockoutTotal > 0 && knockoutFilled < knockoutTotal) {
    const n = knockoutTotal - knockoutFilled
    missingItems.push(`${n} partido${n > 1 ? "s" : ""} de eliminatoria sin completar`)
  }
  if (invalidKnockoutCount > 0) {
    missingItems.push(`${invalidKnockoutCount} empate${invalidKnockoutCount > 1 ? "s" : ""} en eliminatoria sin definir penales`)
  }
  if (!bonusPicks.topScorer) missingItems.push("Goleador del torneo (bonus)")
  if (!bonusPicks.mostGoalsTeam) missingItems.push("Equipo con más goles (bonus)")

  const canSubmit = missingItems.length === 0 && (groupTotal > 0 || knockoutTotal > 0)

  // ── R32 sync handler ─────────────────────────────────────────────────────────
  async function handleR32Sync() {
    setR32Syncing(true)
    setR32SyncError(null)
    const res = await fetch(`/api/quiniela/${quinielaId}/sync-r32`, { method: "POST" })
    if (res.ok) {
      // Reload to get fresh bracket_picks with updated team IDs from server
      window.location.reload()
    } else {
      const data = await res.json().catch(() => ({}))
      setR32SyncError(data.error ?? "Error al sincronizar")
      setR32Syncing(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8">

      {/* ══ R32 sync modal — shown when knockout editing is open and teams changed ═ */}
      {showR32Modal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}>
          <div style={{
            background: "white", borderRadius: "20px", padding: "28px",
            maxWidth: "440px", width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: "32px", textAlign: "center", marginBottom: "16px" }}>🏆</div>
            <h3 style={{ fontWeight: 800, fontSize: "17px", color: "#111827", margin: "0 0 12px", textAlign: "center" }}>
              Los cruces de R32 ya están definidos
            </h3>
            <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.6, margin: "0 0 20px" }}>
              Los equipos reales de la Ronda de 32 ya fueron asignados. Si continúas, actualizaremos
              esta quiniela con los equipos reales. Tus marcadores guardados se mantendrán.
            </p>
            {r32SyncError && (
              <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>{r32SyncError}</p>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={handleR32Sync}
                disabled={r32Syncing}
                style={{
                  padding: "10px 24px", borderRadius: "10px", fontWeight: 700, fontSize: "14px",
                  background: "linear-gradient(135deg, #F5C518, #FFD700)",
                  color: "#111", border: "none", cursor: r32Syncing ? "not-allowed" : "pointer",
                  opacity: r32Syncing ? 0.6 : 1,
                }}
              >
                {r32Syncing ? "Actualizando..." : "Actualizar y continuar"}
              </button>
              <button
                onClick={() => setShowR32Modal(false)}
                disabled={r32Syncing}
                style={{
                  padding: "10px 20px", borderRadius: "10px", fontWeight: 600, fontSize: "14px",
                  background: "white", color: "#374151",
                  border: "1px solid #d1d5db", cursor: "pointer",
                }}
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Champion banner — readOnly mode: shown at top as first thing ═══════ */}
      {champion && readOnly && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0d1f06, #1a2a06)", border: "2px solid rgba(245,197,24,0.5)" }}>
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="text-5xl flex-shrink-0">🏆</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-widest font-bold mb-0.5" style={{ color: "#7ab88a" }}>
                Campeón elegido
              </p>
              <p className="text-xl font-black truncate" style={{ color: "#F5C518" }}>{champion.name}</p>
            </div>
            {champion.flag && (
              <img src={champion.flag} alt={champion.name} className="h-10 w-16 object-contain flex-shrink-0 rounded" />
            )}
          </div>
        </div>
      )}

      {/* ══ Locked banner ════════════════════════════════════════════════════ */}
      {isLocked && !readOnly && !knockoutEditable && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.25)" }}>
          <span className="text-xl">🔒</span>
          <div>
            <p className="text-[#F5C518] font-bold text-sm">El torneo ya comenzó</p>
            <p className="text-[#7ab88a] text-xs mt-0.5">Las predicciones están bloqueadas.</p>
          </div>
        </div>
      )}

      {/* ══ Reopen banner — knockout editing enabled by admin ════════════════ */}
      {isLocked && !readOnly && knockoutEditable && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.35)" }}>
          <span className="text-xl">🔓</span>
          <div>
            <p className="font-bold text-sm" style={{ color: "#60a5fa" }}>Edición de eliminatorias abierta</p>
            <p className="text-xs mt-0.5" style={{ color: "#7ab88a" }}>Solo partidos no iniciados son editables. Los grupos están bloqueados.</p>
          </div>
        </div>
      )}

      {/* ══ Team update notice — shown when real knockout teams are available ═ */}
      {isLocked && !readOnly && knockoutEditable && Object.keys(realKnockoutFixtures).length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.3)" }}>
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-bold text-sm" style={{ color: "#F5C518" }}>Equipos actualizados en eliminatorias</p>
            <p className="text-xs mt-0.5" style={{ color: "#9ab8a0" }}>
              Tus resultados se mantendrán pero pueden dejar de ser coherentes con los nuevos equipos.
              Al guardar cada partido se registran los equipos reales del torneo.
            </p>
          </div>
        </div>
      )}

      {/* ══ Save bar — sticky, visible when any fixture is editable ═══════════ */}
      {canEdit && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(8,14,6,0.97)", borderBottom: "1px solid #2a5438", backdropFilter: "blur(6px)" }}>
          <button
            onClick={saveAllPreds}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg font-bold text-sm transition-all flex-shrink-0"
            style={{
              background: isSaving ? "rgba(42,84,56,0.5)" : "linear-gradient(135deg, #2a7a4a, #3a9a5a)",
              color: isSaving ? "#4a7a5a" : "#fff",
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "Guardando…" : status === "draft" ? "Guardar borrador" : "Guardar cambios"}
          </button>
          {isDirty && !isSaving && draftResult !== "ok" && (
            <span className="text-[#F5C518] text-xs">· cambios sin guardar</span>
          )}
          {draftResult === "ok" && (
            <span className="text-green-400 text-sm font-medium">
              {draftError ?? "✓ Guardado"}
            </span>
          )}
          {draftResult === "error" && (
            <span className="text-red-400 text-xs">{draftError}</span>
          )}
          <Link href={`/quiniela/${quinielaId}`}
            className="ml-auto flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "rgba(42,84,56,0.4)", color: "#7ab88a", border: "1px solid #2a5438" }}>
            Ver quiniela
          </Link>
        </div>
      )}

      {/* ══ Groups phase ══════════════════════════════════════════════════════ */}
      {groupFixtures.length > 0 && (
        <div>
          <PhaseHeader phase="groups" />
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a3322" }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${groupTotal > 0 ? (groupFilled / groupTotal) * 100 : 0}%`, background: "linear-gradient(90deg, #2a7a4a, #F5C518)" }} />
            </div>
            <span className="text-[#7ab88a] text-xs flex-shrink-0">{groupFilled}/{groupTotal}</span>
          </div>

          {(() => {
            const gMap = new Map<string, Fixture[]>()
            groupFixtures.forEach(f => {
              const gn = f.group_name ?? "Sin Grupo"
              if (!gMap.has(gn)) gMap.set(gn, [])
              gMap.get(gn)!.push(f)
            })
            return [...gMap.keys()].sort().map(gn => (
              <div key={gn} className="mb-6">
                <p className="text-[#F5C518] text-xs font-bold uppercase tracking-wider mb-2 px-1">{gn}</p>
                <div className="flex flex-col lg:flex-row gap-3 items-start">
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {gMap.get(gn)!.map(fixture => (
                      <CompactGroupRow key={fixture.id} fixture={fixture} pred={preds[fixture.id]} isLocked={effectiveLock} onUpdate={updatePred} onSave={savePred} />
                    ))}
                  </div>
                  <div className="w-full lg:w-52 flex-shrink-0">
                    <ProjectedStandingsTable standings={groupProjections.get(gn) ?? []} best3rdIds={best3rdIds} />
                  </div>
                </div>
              </div>
            ))
          })()}

        </div>
      )}

      {/* ══ Knockout bracket (horizontal scrollable columns) ══════════════════ */}
      {(["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"] as Phase[]).some(p => (byPhase[p] ?? []).length > 0) && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest">Fase Eliminatoria</h2>
            <div className="flex-1 h-px bg-[#2a5438]" />
          </div>

          {invalidKnockoutCount > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red-400"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {invalidKnockoutCount} partido{invalidKnockoutCount > 1 ? "s" : ""} con empate — selecciona el ganador de penales
            </div>
          )}

          <div className="overflow-x-auto pb-4 -mx-4 px-4">
            <div className="flex gap-2 min-w-max items-start">
              {(["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"] as Phase[]).map((phase, phaseIdx) => {
                const allPhaseFixtures = byPhase[phase] ?? []
                if (allPhaseFixtures.length === 0) return null

                // Split 3P from regular SF fixtures
                const regularFixtures = phase === "semifinals"
                  ? allPhaseFixtures.filter(f => f.bracket_position !== "3P")
                  : allPhaseFixtures
                const thirdPlaceFixtures = phase === "semifinals"
                  ? allPhaseFixtures.filter(f => f.bracket_position === "3P")
                  : []

                return (
                  <div key={phase} className="flex items-center gap-3">
                    {/* Phase column */}
                    <div className="flex flex-col gap-2">
                      {/* Phase header */}
                      <div className="text-center mb-1">
                        <p className="text-[#F5C518] font-bold text-xs uppercase tracking-wider">{PHASE_LABELS[phase]}</p>
                        <p className="text-[#4a7a5a] text-xs">×{PHASE_MULTIPLIER[phase]}</p>
                      </div>

                      {/* Regular fixtures */}
                      {regularFixtures.map(f => (
                        <BracketMatchCard
                          key={f.id}
                          fixture={f}
                          pred={preds[f.id]}
                          isLocked={isFixtureLocked(f)}
                          proj={projectedBracket[f.id]}
                          onUpdate={updatePred}
                          onSave={savePred}
                        />
                      ))}

                      {/* Champion — inline directly below Final card */}
                      {phase === "final" && champion && (
                        <div className="w-40 rounded-lg px-3 py-2.5 mt-0.5 text-center flex-shrink-0"
                          style={{ background: "rgba(10,18,8,0.8)", border: "2px solid rgba(245,197,24,0.65)" }}>
                          <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: "#7ab88a" }}>
                            Campeón elegido
                          </p>
                          <div className="flex items-center justify-center gap-2 mt-1">
                            {champion.flag && (
                              <img src={champion.flag} alt={champion.name}
                                className="h-5 w-8 object-contain flex-shrink-0 rounded-sm" />
                            )}
                            <p className="text-sm font-black truncate" style={{ color: "#F5C518" }}>
                              {champion.name}
                            </p>
                          </div>
                          <div className="text-xl mt-1">🏆</div>
                        </div>
                      )}

                      {/* Third-place game (below SF) */}
                      {thirdPlaceFixtures.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[#7ab88a] text-xs text-center mb-2 font-bold uppercase tracking-wider">3er Lugar</p>
                          {thirdPlaceFixtures.map(f => (
                            <BracketMatchCard
                              key={f.id}
                              fixture={f}
                              pred={preds[f.id]}
                              isLocked={isFixtureLocked(f)}
                              proj={projectedBracket[f.id]}
                              onUpdate={updatePred}
                              onSave={savePred}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Arrow connector — visible green, not after last phase */}
                    {phaseIdx < 4 && (byPhase[["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"][phaseIdx + 1] as Phase] ?? []).length > 0 && (
                      <div className="flex flex-col items-center justify-center self-stretch px-1">
                        <span className="font-bold text-sm" style={{ color: "#3a7a4a" }}>›</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}


      {/* ══ Bottom section: hidden in readOnly, varies by status × deadline ════ */}
      {!readOnly && (status === "draft" ? (
        /* ── Draft: show submit gate ── */
        <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, #1a1a06, #1a3322)", border: "2px solid rgba(245,197,24,0.35)" }}>
          <div className="flex items-start gap-4 mb-4">
            <span className="text-3xl flex-shrink-0">📋</span>
            <div>
              <h3 className="text-white font-bold text-lg">Enviar quiniela</h3>
              <p className="text-[#7ab88a] text-sm mt-0.5">Solo las quinielas enviadas aparecen en el ranking y cuentan en el pozo.</p>
            </div>
          </div>

          <div className="mb-4 px-1 flex flex-col gap-2">
            {/* Group stage progress */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#7ab88a]">Fase de grupos</span>
                <span className={groupFilled === groupTotal && groupTotal > 0 ? "text-green-400 font-bold" : "text-[#F5C518]"}>{groupFilled}/{groupTotal}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0d1f11" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${groupTotal > 0 ? (groupFilled / groupTotal) * 100 : 0}%`, background: groupFilled === groupTotal ? "#4ade80" : "linear-gradient(90deg, #F5C518, #FFD700)" }} />
              </div>
            </div>
            {/* Knockout progress */}
            {knockoutTotal > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#7ab88a]">Eliminatoria</span>
                  <span className={knockoutFilled === knockoutTotal ? "text-green-400 font-bold" : "text-[#F5C518]"}>{knockoutFilled}/{knockoutTotal}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#0d1f11" }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${(knockoutFilled / knockoutTotal) * 100}%`, background: knockoutFilled === knockoutTotal ? "#4ade80" : "linear-gradient(90deg, #F5C518, #FFD700)" }} />
                </div>
              </div>
            )}
            {isDirty && (
              <p className="text-[#F5C518] text-xs">· Guarda el borrador antes de enviar para no perder cambios.</p>
            )}
            {/* Missing items — blocking list */}
            {missingItems.length > 0 && (
              <div className="rounded-lg px-3 py-2.5 mt-1" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-red-400 text-xs font-semibold mb-1.5">Faltan los siguientes para enviar:</p>
                <ul className="space-y-0.5">
                  {missingItems.map((item, i) => (
                    <li key={i} className="text-red-300 text-xs flex items-start gap-1.5">
                      <span className="flex-shrink-0 mt-0.5">·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[#6b7280] text-xs mt-2">Puedes guardarla como borrador mientras tanto.</p>
              </div>
            )}
          </div>

          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)} disabled={!canSubmit}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-all"
              style={{ background: canSubmit ? "linear-gradient(135deg, #F5C518, #FFD700)" : "rgba(42,84,56,0.5)", color: canSubmit ? "#000" : "#4a7a5a", cursor: canSubmit ? "pointer" : "not-allowed" }}>
              Enviar Quiniela
            </button>
          ) : (
            <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,197,24,0.4)" }}>
              <p className="text-white font-bold text-sm mb-1">¿Confirmar envío?</p>
              <p className="text-[#7ab88a] text-xs mb-3">Una vez enviada, tu quiniela queda registrada oficialmente.</p>
              {poolPrizeType === "physical" ? (
                <div className="mb-3 space-y-1.5 text-xs" style={{ borderLeft: "2px solid rgba(245,197,24,0.4)", paddingLeft: "10px" }}>
                  <p className="text-[#7ab88a]">Esta liga usa premios físicos en lugar de pozo en dinero.</p>
                  {[
                    { icon: "🥇", label: "1º", value: poolPrize1st },
                    { icon: "🥈", label: "2º", value: poolPrize2nd },
                    { icon: "🥉", label: "3º", value: poolPrize3rd },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-[#7ab88a]">{icon} Premios de la liga {label}</span>
                      <span className="text-white font-semibold">{value ?? "Por definir"}</span>
                    </div>
                  ))}
                </div>
              ) : poolPrice !== undefined ? (
                <div className="mb-3 space-y-1 text-xs" style={{ borderLeft: "2px solid rgba(245,197,24,0.4)", paddingLeft: "10px" }}>
                  <div className="flex justify-between">
                    <span className="text-[#7ab88a]">Precio por quiniela</span>
                    <span className="text-white font-semibold">${poolPrice} {poolCurrency ?? "USD"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#7ab88a]">Tus quinielas enviadas</span>
                    <span className="text-white font-semibold">{submittedCount + 1}</span>
                  </div>
                  <div className="flex justify-between" style={{ borderTop: "1px solid rgba(245,197,24,0.2)", paddingTop: "4px", marginTop: "4px" }}>
                    <span className="text-[#F5C518] font-bold">Total a pagar</span>
                    <span className="text-[#F5C518] font-black">${(submittedCount + 1) * poolPrice} {poolCurrency ?? "USD"}</span>
                  </div>
                </div>
              ) : null}
              {submitError && <p className="text-red-400 text-xs mb-2">{submitError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-black text-sm uppercase tracking-wide"
                  style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
                  {submitting ? "Enviando…" : "Confirmar"}
                </button>
                <button onClick={() => { setShowConfirm(false); setSubmitError(null) }} disabled={submitting}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "rgba(42,84,56,0.5)", color: "#7ab88a" }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (!isLocked || knockoutEditable) ? (
        /* ── Submitted + editable (before deadline or knockout reopen) ── */
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #0d2a1a, #0a1a0d)", border: "2px solid #2a7a4a" }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-white font-bold">Quiniela Enviada</p>
              <p className="text-[#7ab88a] text-xs mt-0.5">
                {knockoutEditable
                  ? "Edición de eliminatorias disponible. Guarda tus cambios en partidos no iniciados."
                  : "Apareces en el ranking y en el pozo. Puedes seguir editando tus predicciones hasta el inicio del torneo."}
              </p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#7ab88a]">Fase de grupos completada</span>
              <span className={groupFilled === groupTotal && groupTotal > 0 ? "text-green-400 font-bold" : "text-[#4a7a5a]"}>{groupFilled}/{groupTotal}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "#0a1208" }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${groupTotal > 0 ? (groupFilled / groupTotal) * 100 : 0}%`, background: "#2a7a4a" }} />
            </div>
          </div>
          {isDirty && (
            <p className="text-[#F5C518] text-xs mt-2">· Tienes cambios sin guardar — usa &quot;Guardar cambios&quot; arriba.</p>
          )}
        </div>
      ) : (
        /* ── After deadline: static read-only banner ── */
        <div className="rounded-2xl p-5 text-center" style={{ background: "linear-gradient(135deg, #0d2a1a, #0a1a0d)", border: "2px solid #2a7a4a" }}>
          <div className="text-3xl mb-2">✅</div>
          <p className="text-white font-bold">Quiniela Enviada Oficialmente</p>
          <p className="text-[#7ab88a] text-sm mt-1">Apareces en el ranking y en el pozo.</p>
        </div>
      ))}

      {/* ══ Bottom action bar — hidden in readOnly mode ══════════════════════════ */}
      {!readOnly && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{ background: "rgba(8,14,6,0.97)", border: "1px solid #2a5438" }}>
          {canEdit && (
            <button
              onClick={saveAllPreds}
              disabled={isSaving}
              className="px-5 py-2 rounded-lg font-bold text-sm transition-all flex-shrink-0"
              style={{
                background: isSaving ? "rgba(42,84,56,0.5)" : "linear-gradient(135deg, #2a7a4a, #3a9a5a)",
                color: isSaving ? "#4a7a5a" : "#fff",
                cursor: isSaving ? "not-allowed" : "pointer",
              }}
            >
              {isSaving ? "Guardando…" : status === "draft" ? "Guardar borrador" : "Guardar cambios"}
            </button>
          )}
          {draftResult === "ok" && (
            <span className="text-green-400 text-sm font-medium">{draftError ?? "✓ Guardado"}</span>
          )}
          {draftResult === "error" && (
            <span className="text-red-400 text-xs">{draftError}</span>
          )}
          <Link href={`/quiniela/${quinielaId}`}
            className="ml-auto flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "rgba(42,84,56,0.4)", color: "#7ab88a", border: "1px solid #2a5438" }}>
            Ver quiniela
          </Link>
        </div>
      )}
    </div>
  )
}
