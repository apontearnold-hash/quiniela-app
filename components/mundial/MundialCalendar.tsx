"use client"

import Link from "next/link"
import type { Fixture } from "@/lib/types"
import type { SelectedTeam } from "./MundialContent"

const PHASE_SHORT: Record<string, string> = {
  groups:        "",
  round_of_32:   "R32",
  round_of_16:   "Octavos",
  quarterfinals: "Cuartos",
  semifinals:    "Semis",
  final:         "Final",
}

interface Props {
  fixtures: Fixture[]
  onTeamSelect: (team: SelectedTeam) => void
}

function localDateKey(kickoff: string | null): string {
  if (!kickoff) return "sin-fecha"
  // en-CA gives YYYY-MM-DD in local timezone — safe for alphabetical sort
  return new Date(kickoff).toLocaleDateString("en-CA")
}

function formatDateHeader(kickoff: string | null): string {
  if (!kickoff) return "Sin fecha"
  return new Date(kickoff).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  })
}

function formatHour(kickoff: string | null): string {
  if (!kickoff) return "?"
  return new Date(kickoff).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

function StatusBadge({ fixture }: { fixture: Fixture }) {
  if (fixture.status === "live") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        {fixture.elapsed ? `${fixture.elapsed}'` : "LIVE"}
      </span>
    )
  }
  if (fixture.status === "finished" || fixture.status_short === "FT" || fixture.status_short === "AET" || fixture.status_short === "PEN") {
    return <span className="text-[10px] font-bold text-green-600">{fixture.status_short ?? "FT"}</span>
  }
  return <span className="text-[10px] text-[#9ca3af]">{formatHour(fixture.kickoff)}</span>
}

export default function MundialCalendar({ fixtures, onTeamSelect }: Props) {
  if (fixtures.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📅</div>
        <p className="font-bold text-[#111827]">Sin partidos disponibles</p>
      </div>
    )
  }

  // Group by local date
  const byDate = new Map<string, { label: string; items: Fixture[] }>()
  for (const f of fixtures) {
    const key = localDateKey(f.kickoff)
    if (!byDate.has(key)) byDate.set(key, { label: formatDateHeader(f.kickoff), items: [] })
    byDate.get(key)!.items.push(f)
  }
  const sortedDates = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-8">
      {sortedDates.map(([dateKey, { label, items }]) => (
        <div key={dateKey}>
          {/* Date header — appears once per day */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[#374151] text-xs font-bold uppercase tracking-widest whitespace-nowrap capitalize">
              {label}
            </h2>
            <div className="flex-1 h-px bg-[#e5e7eb]" />
            <span className="text-[#9ca3af] text-xs flex-shrink-0">{items.length} partidos</span>
          </div>

          {/* Match cards grid — 1 col on mobile, 2 on md+ */}
          <div className="grid gap-2 md:grid-cols-2">
            {items.map(f => {
              const hasResult = f.home_score !== null
              const homeName  = f.home_team_name || f.home_placeholder || "TBD"
              const awayName  = f.away_team_name || f.away_placeholder || "TBD"
              const phaseTag  = f.phase ? PHASE_SHORT[f.phase] : ""
              const isLive    = f.status === "live"

              const homeWins = hasResult && f.home_score! > f.away_score!
              const awayWins = hasResult && f.away_score! > f.home_score!

              return (
                <div
                  key={f.id}
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: "white",
                    border: `1px solid ${isLive ? "#fbbf24" : "#d1d5db"}`,
                    boxShadow: isLive ? "0 0 0 1px #fbbf2440" : "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  {/* Top meta row: phase tag + status */}
                  <div className="flex items-center justify-between px-3 pt-2 pb-0">
                    <span className="text-[#9ca3af] text-[10px] font-semibold uppercase tracking-wider">
                      {phaseTag || (f.group_name ?? "")}
                    </span>
                    <StatusBadge fixture={f} />
                  </div>

                  {/* Main match row — links to detail */}
                  <Link href={`/fixtures/${f.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-[#f9fafb] transition-colors">
                    {/* Home team */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {f.home_team_flag
                        ? <img src={f.home_team_flag} alt="" className="w-6 h-4 object-contain flex-shrink-0 rounded-sm" />
                        : <span className="w-6 h-4 rounded-sm bg-[#e5e7eb] flex-shrink-0" />
                      }
                      <span className={`text-sm font-medium truncate ${homeWins ? "text-[#d97706] font-bold" : "text-[#111827]"}`}>
                        {homeName}
                      </span>
                    </div>

                    {/* Score / vs */}
                    <div className="flex flex-col items-center flex-shrink-0 min-w-[48px]">
                      {hasResult ? (
                        <>
                          <span className="text-[#111827] font-black text-base leading-tight">
                            {f.home_score} – {f.away_score}
                          </span>
                          {f.went_to_penalties && (
                            <span className="text-[#9ca3af] text-[10px] leading-tight">Pen.</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[#9ca3af] text-sm font-medium">vs</span>
                      )}
                    </div>

                    {/* Away team */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className={`text-sm font-medium truncate text-right ${awayWins ? "text-[#d97706] font-bold" : "text-[#111827]"}`}>
                        {awayName}
                      </span>
                      {f.away_team_flag
                        ? <img src={f.away_team_flag} alt="" className="w-6 h-4 object-contain flex-shrink-0 rounded-sm" />
                        : <span className="w-6 h-4 rounded-sm bg-[#e5e7eb] flex-shrink-0" />
                      }
                    </div>
                  </Link>

                  {/* Footer: team select buttons (group stage only) */}
                  {f.phase === "groups" && (f.home_team_id || f.away_team_id) && (
                    <div className="flex items-center justify-end gap-2 px-3 pb-2">
                      {f.home_team_id && f.home_team_name && (
                        <button
                          onClick={() => onTeamSelect({ teamId: f.home_team_id!, teamName: f.home_team_name!, teamFlag: f.home_team_flag })}
                          className="text-[#6b7280] text-xs hover:text-[#d97706] transition-colors"
                          title={`Ver info de ${f.home_team_name}`}
                        >
                          + {f.home_team_name}
                        </button>
                      )}
                      {f.home_team_id && f.away_team_id && (
                        <span className="text-[#e5e7eb] text-xs">·</span>
                      )}
                      {f.away_team_id && f.away_team_name && (
                        <button
                          onClick={() => onTeamSelect({ teamId: f.away_team_id!, teamName: f.away_team_name!, teamFlag: f.away_team_flag })}
                          className="text-[#6b7280] text-xs hover:text-[#d97706] transition-colors"
                          title={`Ver info de ${f.away_team_name}`}
                        >
                          + {f.away_team_name}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
