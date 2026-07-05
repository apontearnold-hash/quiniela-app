"use client"

import { useState, useMemo } from "react"

export interface FixtureSelectItem {
  id: number
  homeName: string | null
  homeFlag: string | null
  awayName: string | null
  awayFlag: string | null
  homePlaceholder: string | null
  awayPlaceholder: string | null
  kickoff: string | null
  status: string
  phase: string | null
  groupName: string | null
  homeScore: number | null
  awayScore: number | null
}

interface PredRow {
  quinielaId: string
  quinielaName: string
  playerName: string | null
  homeScorePred: number | null
  awayScorePred: number | null
  predictsPenalties: boolean
  penaltiesWinner: string | null
  pointsEarned: number
  homeTeamNamePred: string | null
  awayTeamNamePred: string | null
  homeTeamIdPred: number | null
  awayTeamIdPred: number | null
}

interface MatchFixture {
  id: number
  home_team_id: number | null
  away_team_id: number | null
  home_team_name: string | null
  away_team_name: string | null
  home_team_flag: string | null
  away_team_flag: string | null
  status: string
  home_score: number | null
  away_score: number | null
  phase: string | null
  kickoff: string | null
  bracket_position: string | null
  went_to_penalties: boolean
  penalties_winner: string | null
}

interface MatchData {
  fixture: MatchFixture
  predictions: PredRow[]
}

function fmtDayLabel(kickoff: string | null): string {
  if (!kickoff) return "Sin fecha"
  return new Date(kickoff).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
}

function dateLabelFor(dateKey: string): string {
  const today    = new Date().toLocaleDateString("en-CA")
  const tmrwDate = new Date()
  tmrwDate.setDate(tmrwDate.getDate() + 1)
  const tomorrow = tmrwDate.toLocaleDateString("en-CA")

  const [y, m, d] = dateKey.split("-").map(Number)
  const localDate = new Date(y, m - 1, d)
  const monthDay  = localDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" })

  if (dateKey === today)    return `Hoy · ${monthDay}`
  if (dateKey === tomorrow) return `Mañana · ${monthDay}`
  return monthDay
}

function fmtTime(kickoff: string | null): string {
  if (!kickoff) return ""
  return new Date(kickoff).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

function direction(h: number | null, a: number | null): "home" | "draw" | "away" | null {
  if (h === null || a === null) return null
  if (h > a) return "home"
  if (a > h) return "away"
  return "draw"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OutcomeChip({ dir, homeName, awayName, isKnockout, predictsPenalties, penaltiesWinner }: {
  dir: "home" | "draw" | "away" | null
  homeName: string
  awayName: string
  isKnockout?: boolean
  predictsPenalties?: boolean
  penaltiesWinner?: string | null
}) {
  if (!dir) return <span className="text-gray-400 text-xs">—</span>
  if (dir === "draw") {
    if (isKnockout && predictsPenalties && penaltiesWinner) {
      const penTeam = penaltiesWinner === "home" ? homeName : awayName
      const penDir  = penaltiesWinner === "home" ? "home" : "away"
      return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold truncate max-w-[140px] ${penDir === "home" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
          {penTeam} <span className="ml-1 text-[10px] opacity-70">(pens)</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
        {isKnockout ? "Empate — sin penales" : "Empate"}
      </span>
    )
  }
  const team = dir === "home" ? homeName : awayName
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold truncate max-w-[120px] ${dir === "home" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
      {team}
    </span>
  )
}

function MatchHeader({ fixture }: { fixture: MatchFixture }) {
  const isFinished = fixture.status === "finished"
  const isLive     = fixture.status === "live" || fixture.status === "1H" || fixture.status === "2H" || fixture.status === "HT"

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-gray-50 border border-gray-100">
      {/* Home */}
      <div className="flex flex-col items-center gap-1 text-center min-w-0 flex-1">
        {fixture.home_team_flag && (
          <img src={fixture.home_team_flag} alt="" className="w-8 h-5 object-contain" />
        )}
        <span className="text-xs font-semibold text-gray-700 truncate w-full">
          {fixture.home_team_name ?? "Local"}
        </span>
      </div>

      {/* Score / VS */}
      <div className="flex-shrink-0 text-center">
        {isFinished ? (
          <>
            <div className="text-lg font-black text-gray-900 tabular-nums">
              {fixture.home_score} – {fixture.away_score}
            </div>
            {fixture.went_to_penalties && (
              <div className="text-xs text-gray-400 mt-0.5">Penales</div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold text-gray-400">vs</span>
            {isLive ? (
              <span className="text-xs font-bold text-green-600 animate-pulse">EN VIVO</span>
            ) : fixture.kickoff ? (
              <span className="text-xs text-gray-400">{fmtDayLabel(fixture.kickoff)}</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Away */}
      <div className="flex flex-col items-center gap-1 text-center min-w-0 flex-1">
        {fixture.away_team_flag && (
          <img src={fixture.away_team_flag} alt="" className="w-8 h-5 object-contain" />
        )}
        <span className="text-xs font-semibold text-gray-700 truncate w-full">
          {fixture.away_team_name ?? "Visitante"}
        </span>
      </div>
    </div>
  )
}

function SummaryBar({ total, home, draw, away, eliminated, homeName, awayName, mostCommon }: {
  total: number
  home: number
  draw: number
  away: number
  // Knockout-only: picks whose predicted winner is neither of the fixture's
  // two real teams (the team they picked got eliminated before this slot).
  // Counted on their own — never folded into home/away just because the
  // predicted scoreline happened to lean that direction.
  eliminated: number
  homeName: string
  awayName: string
  mostCommon: { score: string; count: number } | null
}) {
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const hp = pct(home), dp = pct(draw), ap = pct(away), elp = pct(eliminated)
  const showEliminated = eliminated > 0

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      {/* Stacked bar */}
      <div className="h-2 flex">
        <div className="bg-blue-400 transition-all" style={{ width: `${hp}%` }} />
        <div className="bg-gray-300 transition-all" style={{ width: `${dp}%` }} />
        <div className="bg-green-400 transition-all" style={{ width: `${ap}%` }} />
        {showEliminated && <div className="bg-slate-400 transition-all" style={{ width: `${elp}%` }} />}
      </div>

      {/* Column stats */}
      <div className={`grid ${showEliminated ? "grid-cols-4" : "grid-cols-3"} divide-x divide-gray-200 text-center text-xs py-2.5`}>
        <div className="px-2">
          <div className="font-black text-blue-600 text-base leading-none">{home}</div>
          <div className="text-gray-500 mt-0.5 truncate px-1">{homeName}</div>
          <div className="text-gray-400">{hp}%</div>
        </div>
        <div className="px-2">
          <div className="font-black text-gray-600 text-base leading-none">{draw}</div>
          <div className="text-gray-500 mt-0.5">Empate</div>
          <div className="text-gray-400">{dp}%</div>
        </div>
        <div className="px-2">
          <div className="font-black text-green-600 text-base leading-none">{away}</div>
          <div className="text-gray-500 mt-0.5 truncate px-1">{awayName}</div>
          <div className="text-gray-400">{ap}%</div>
        </div>
        {showEliminated && (
          <div className="px-2">
            <div className="font-black text-slate-500 text-base leading-none">{eliminated}</div>
            <div className="text-gray-500 mt-0.5 truncate px-1">Equipo eliminado</div>
            <div className="text-gray-400">{elp}%</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-between flex-wrap gap-x-3 text-xs text-gray-500">
        <span>{total} predicci{total === 1 ? "ón" : "ones"}</span>
        {mostCommon && (
          <span>
            Más común: <strong className="text-gray-700">{mostCommon.score}</strong>
            <span className="text-gray-400"> · {mostCommon.count}×</span>
          </span>
        )}
      </div>
    </div>
  )
}

function PredictionsTable({ predictions, fixture, isFinished }: {
  predictions: PredRow[]
  fixture: MatchFixture
  isFinished: boolean
}) {
  // Fallback names for the fixture header / summary bar — never used for a row's
  // own "Apostó por" chip once that quiniela has its own saved team names, since
  // an eliminated team a user picked must keep showing as that team, not the
  // real one that actually advanced.
  const fallbackHomeName = fixture.home_team_name ?? "Local"
  const fallbackAwayName = fixture.away_team_name ?? "Visitante"
  const isKnockout = fixture.phase !== "groups"

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Quiniela</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Jugador</th>
              <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Pred.</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Apostó por</th>
              {isFinished && (
                <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Pts</th>
              )}
            </tr>
          </thead>
          <tbody>
            {predictions.map((p, i) => {
              const dir = direction(p.homeScorePred, p.awayScorePred)
              const rowHomeName = p.homeTeamNamePred ?? fallbackHomeName
              const rowAwayName = p.awayTeamNamePred ?? fallbackAwayName
              return (
                <tr
                  key={p.quinielaId}
                  style={{
                    background: i % 2 === 0 ? "white" : "#f9fafb",
                    borderBottom: "1px solid #f9fafb",
                  }}
                >
                  <td className="px-3 py-2 font-medium text-gray-900">{p.quinielaName}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs hidden md:table-cell">{p.playerName ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {p.homeScorePred !== null && p.awayScorePred !== null ? (
                      <span className="font-black text-gray-900 tabular-nums">
                        {p.homeScorePred} – {p.awayScorePred}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <OutcomeChip dir={dir} homeName={rowHomeName} awayName={rowAwayName} isKnockout={isKnockout} predictsPenalties={p.predictsPenalties} penaltiesWinner={p.penaltiesWinner} />
                  </td>
                  {isFinished && (
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold text-sm tabular-nums ${p.pointsEarned > 0 ? "text-amber-600" : "text-gray-400"}`}>
                        {p.pointsEarned > 0 ? `+${p.pointsEarned}` : "0"}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {predictions.map(p => {
          const dir = direction(p.homeScorePred, p.awayScorePred)
          const rowHomeName = p.homeTeamNamePred ?? fallbackHomeName
          const rowAwayName = p.awayTeamNamePred ?? fallbackAwayName
          return (
            <div
              key={p.quinielaId}
              className="rounded-xl border border-gray-100 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{p.quinielaName}</div>
                  {p.playerName && (
                    <div className="text-xs text-gray-500 truncate">{p.playerName}</div>
                  )}
                </div>
                {isFinished && (
                  <span className={`text-sm font-black flex-shrink-0 ${p.pointsEarned > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    {p.pointsEarned > 0 ? `+${p.pointsEarned} pts` : "0 pts"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {p.homeScorePred !== null && p.awayScorePred !== null ? (
                  <span className="font-black text-gray-900 text-sm tabular-nums">
                    {p.homeScorePred} – {p.awayScorePred}
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">—</span>
                )}
                <OutcomeChip dir={dir} homeName={rowHomeName} awayName={rowAwayName} isKnockout={isKnockout} predictsPenalties={p.predictsPenalties} penaltiesWinner={p.penaltiesWinner} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MatchPredictionsPanel({
  fixtures,
  poolId,
}: {
  fixtures: FixtureSelectItem[]
  poolId: string
}) {
  const [selectedId, setSelectedId] = useState("")
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Smart default: today if it has matches → next future date → last date with matches
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date().toLocaleDateString("en-CA")
    const allDates = [...new Set(
      fixtures
        .filter(f => f.kickoff)
        .map(f => new Date(f.kickoff!).toLocaleDateString("en-CA"))
    )].sort()
    if (allDates.includes(today)) return today
    const future = allDates.filter(d => d > today)
    if (future.length > 0) return future[0]
    return allDates[allDates.length - 1] ?? "all"
  })

  function handleDateSelect(date: string) {
    setSelectedDate(date)
    // Clear match selection if it no longer belongs to the chosen date
    if (selectedId && date !== "all") {
      const stillValid = fixtures.some(
        f => String(f.id) === selectedId &&
             f.kickoff &&
             new Date(f.kickoff).toLocaleDateString("en-CA") === date
      )
      if (!stillValid) {
        setSelectedId("")
        setMatchData(null)
        setError(null)
      }
    }
  }

  async function handleSelect(fixtureId: string) {
    setSelectedId(fixtureId)
    setMatchData(null)
    setError(null)
    if (!fixtureId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/dashboard/match-predictions?poolId=${encodeURIComponent(poolId)}&fixtureId=${encodeURIComponent(fixtureId)}`
      )
      if (!res.ok) throw new Error("Error al cargar predicciones")
      setMatchData(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  // Build date-based optgroup structure (calendar order, all phases)
  const grouped = useMemo(() => {
    const allSorted = [...fixtures].sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
    const byDate = new Map<string, FixtureSelectItem[]>()
    for (const f of allSorted) {
      const key = f.kickoff ? new Date(f.kickoff).toLocaleDateString("en-CA") : "sin-fecha"
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(f)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, fxs]) => ({ key, label: fmtDayLabel(fxs[0]?.kickoff ?? null), fixtures: fxs }))
      .filter(d => d.fixtures.length > 0)
  }, [fixtures])

  const filteredGroups = useMemo(() => {
    if (selectedDate === "all") return grouped
    return grouped.filter(g => g.key === selectedDate)
  }, [grouped, selectedDate])

  function optLabel(f: FixtureSelectItem): string {
    const home  = f.homeName ?? f.homePlaceholder ?? "TBD"
    const away  = f.awayName ?? f.awayPlaceholder ?? "TBD"
    const time  = f.kickoff ? ` · ${fmtTime(f.kickoff)}` : ""
    const group = f.groupName ? ` · ${f.groupName}` : ""
    const st    = f.status === "finished" ? " · FT" : f.status === "live" ? " · EN VIVO" : ""
    return `${home} vs ${away}${time}${group}${st}`
  }

  // Summary stats derived from matchData
  const summary = useMemo(() => {
    if (!matchData) return null
    const { predictions, fixture } = matchData
    const withScore = predictions.filter(p => p.homeScorePred !== null && p.awayScorePred !== null)
    const isKnockout = fixture.phase !== "groups"
    let home = 0, draw = 0, away = 0, eliminated = 0
    const counts: Record<string, number> = {}
    for (const p of withScore) {
      const key = `${p.homeScorePred}-${p.awayScorePred}`
      counts[key] = (counts[key] ?? 0) + 1
      const d = direction(p.homeScorePred, p.awayScorePred)

      // Which side (in the user's OWN predicted matchup) came out ahead —
      // "home"/"away" here refer to the pick's own slots, not necessarily
      // the real fixture's sides yet.
      let predictedWinnerSide: "home" | "away" | "draw" = d ?? "draw"
      if (predictedWinnerSide === "draw" && isKnockout && p.predictsPenalties && p.penaltiesWinner) {
        predictedWinnerSide = p.penaltiesWinner === "home" ? "home" : "away"
      }

      if (predictedWinnerSide === "draw") {
        draw++
        continue
      }

      // Knockout: a predicted winner only counts toward the real fixture's
      // home/away column if that team's ID actually matches — a pick whose
      // predicted team was eliminated before this real match must never be
      // folded into whichever side its scoreline happened to lean toward.
      if (isKnockout && p.homeTeamIdPred != null && p.awayTeamIdPred != null
          && fixture.home_team_id != null && fixture.away_team_id != null) {
        const predictedWinnerId = predictedWinnerSide === "home" ? p.homeTeamIdPred : p.awayTeamIdPred
        if (predictedWinnerId === fixture.home_team_id) home++
        else if (predictedWinnerId === fixture.away_team_id) away++
        else eliminated++
      } else {
        // Groups (teams always fixed/correct) or legacy picks with no team-id
        // data — fall back to the original scoreline-direction bucketing.
        if (predictedWinnerSide === "home") home++
        else away++
      }
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return {
      total:      withScore.length,
      home, draw, away, eliminated,
      homeName:   fixture.home_team_name ?? "Local",
      awayName:   fixture.away_team_name ?? "Visitante",
      mostCommon: top ? { score: top[0], count: top[1] } : null,
    }
  }, [matchData])

  // Sort: finished → by points desc then name; else → by name
  const sortedPreds = useMemo(() => {
    if (!matchData) return []
    const isFinished = matchData.fixture.status === "finished"
    return [...matchData.predictions].sort((a, b) => {
      if (isFinished && b.pointsEarned !== a.pointsEarned) return b.pointsEarned - a.pointsEarned
      return a.quinielaName.localeCompare(b.quinielaName)
    })
  }, [matchData])

  const isFinished = matchData?.fixture.status === "finished"

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <span className="text-base">🔮</span>
        <h2 className="font-bold text-sm" style={{ color: "#374151" }}>Predicciones por partido</h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Date filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <button
            type="button"
            onClick={() => handleDateSelect("all")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              selectedDate === "all"
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Todos
          </button>
          {grouped.map(day => (
            <button
              key={day.key}
              type="button"
              onClick={() => handleDateSelect(day.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedDate === day.key
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {dateLabelFor(day.key)}
            </button>
          ))}
        </div>

        {/* Fixture selector */}
        <select
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
        >
          <option value="">— Selecciona un partido —</option>
          {filteredGroups.map(day => (
            <optgroup key={day.key} label={day.label}>
              {day.fixtures.map(f => (
                <option key={f.id} value={String(f.id)}>{optLabel(f)}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-400 border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="text-center text-sm text-red-500 py-2">{error}</p>
        )}

        {/* Empty prompt */}
        {!loading && !matchData && !error && !selectedId && (
          <p className="text-center text-sm text-gray-400 py-4">
            Selecciona un partido para ver las predicciones de tu liga.
          </p>
        )}

        {/* Results */}
        {!loading && matchData && summary && (
          <div className="space-y-4">
            <MatchHeader fixture={matchData.fixture} />
            <SummaryBar
              total={summary.total}
              home={summary.home}
              draw={summary.draw}
              away={summary.away}
              eliminated={summary.eliminated}
              homeName={summary.homeName}
              awayName={summary.awayName}
              mostCommon={summary.mostCommon}
            />
            {sortedPreds.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">
                No hay predicciones para este partido en tu liga.
              </p>
            ) : (
              <PredictionsTable
                predictions={sortedPreds}
                fixture={matchData.fixture}
                isFinished={!!isFinished}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
