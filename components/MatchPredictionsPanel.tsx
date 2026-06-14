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
}

interface MatchFixture {
  id: number
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

const PHASE_ORDER = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]
const PHASE_LABEL: Record<string, string> = {
  groups:        "Fase de Grupos",
  round_of_32:   "Ronda de 32",
  round_of_16:   "Octavos de Final",
  quarterfinals: "Cuartos de Final",
  semifinals:    "Semifinales",
  final:         "Final",
}

function fmtDate(kickoff: string | null): string {
  if (!kickoff) return ""
  return new Date(kickoff).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
}

function direction(h: number | null, a: number | null): "home" | "draw" | "away" | null {
  if (h === null || a === null) return null
  if (h > a) return "home"
  if (a > h) return "away"
  return "draw"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OutcomeChip({ dir, homeName, awayName }: { dir: "home" | "draw" | "away" | null; homeName: string; awayName: string }) {
  if (!dir) return <span className="text-gray-400 text-xs">—</span>
  if (dir === "draw") return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
      Empate
    </span>
  )
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
              <span className="text-xs text-gray-400">{fmtDate(fixture.kickoff)}</span>
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

function SummaryBar({ total, home, draw, away, homeName, awayName, mostCommon }: {
  total: number
  home: number
  draw: number
  away: number
  homeName: string
  awayName: string
  mostCommon: { score: string; count: number } | null
}) {
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const hp = pct(home), dp = pct(draw), ap = pct(away)

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      {/* Stacked bar */}
      <div className="h-2 flex">
        <div className="bg-blue-400 transition-all" style={{ width: `${hp}%` }} />
        <div className="bg-gray-300 transition-all" style={{ width: `${dp}%` }} />
        <div className="bg-green-400 transition-all" style={{ width: `${ap}%` }} />
      </div>

      {/* Three-column stats */}
      <div className="grid grid-cols-3 divide-x divide-gray-200 text-center text-xs py-2.5">
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
  const homeName = fixture.home_team_name ?? "Local"
  const awayName = fixture.away_team_name ?? "Visitante"

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
                    <OutcomeChip dir={dir} homeName={homeName} awayName={awayName} />
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
                <OutcomeChip dir={dir} homeName={homeName} awayName={awayName} />
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

  // Build optgroup structure for the select
  const grouped = useMemo(() => {
    return PHASE_ORDER
      .map(phase => {
        const fxs = fixtures
          .filter(f => (f.phase ?? "groups") === phase)
          .sort((a, b) => {
            if (phase === "groups") {
              const gc = (a.groupName ?? "").localeCompare(b.groupName ?? "")
              if (gc !== 0) return gc
            }
            return (a.kickoff ?? "").localeCompare(b.kickoff ?? "")
          })

        if (phase === "groups") {
          const byGroup = new Map<string, FixtureSelectItem[]>()
          for (const f of fxs) {
            const g = f.groupName ?? "Sin grupo"
            if (!byGroup.has(g)) byGroup.set(g, [])
            byGroup.get(g)!.push(f)
          }
          return {
            phase,
            label: PHASE_LABEL[phase],
            subGroups: Array.from(byGroup.entries()).sort(([a], [b]) => a.localeCompare(b)),
            fixtures: null as FixtureSelectItem[] | null,
          }
        }
        return { phase, label: PHASE_LABEL[phase] ?? phase, subGroups: null as [string, FixtureSelectItem[]][] | null, fixtures: fxs }
      })
      .filter(g => (g.fixtures?.length ?? 0) > 0 || (g.subGroups?.some(([, f]) => f.length > 0) ?? false))
  }, [fixtures])

  function optLabel(f: FixtureSelectItem): string {
    const home = f.homeName ?? f.homePlaceholder ?? "TBD"
    const away = f.awayName ?? f.awayPlaceholder ?? "TBD"
    const date = f.kickoff ? ` · ${fmtDate(f.kickoff)}` : ""
    const st   = f.status === "finished" ? " · FT" : f.status === "live" ? " · EN VIVO" : ""
    return `${home} vs ${away}${date}${st}`
  }

  // Summary stats derived from matchData
  const summary = useMemo(() => {
    if (!matchData) return null
    const { predictions, fixture } = matchData
    const withScore = predictions.filter(p => p.homeScorePred !== null && p.awayScorePred !== null)
    let home = 0, draw = 0, away = 0
    const counts: Record<string, number> = {}
    for (const p of withScore) {
      const key = `${p.homeScorePred}-${p.awayScorePred}`
      counts[key] = (counts[key] ?? 0) + 1
      const d = direction(p.homeScorePred, p.awayScorePred)
      if (d === "home") home++
      else if (d === "away") away++
      else draw++
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return {
      total:      withScore.length,
      home, draw, away,
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
        {/* Fixture selector */}
        <select
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
        >
          <option value="">— Selecciona un partido —</option>
          {grouped.map(g => {
            if (g.subGroups) {
              return g.subGroups.map(([groupName, fxs]) => (
                <optgroup key={groupName} label={`${g.label} — ${groupName}`}>
                  {fxs.map(f => (
                    <option key={f.id} value={String(f.id)}>{optLabel(f)}</option>
                  ))}
                </optgroup>
              ))
            }
            return (
              <optgroup key={g.phase} label={g.label}>
                {(g.fixtures ?? []).map(f => (
                  <option key={f.id} value={String(f.id)}>{optLabel(f)}</option>
                ))}
              </optgroup>
            )
          })}
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
