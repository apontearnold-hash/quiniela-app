"use client"

import Link from "next/link"
import type { Fixture, GroupStanding } from "@/lib/types"
import type { SelectedTeam } from "./MundialContent"

interface Props {
  standings: GroupStanding[]
  fixtures: Fixture[]
  onTeamSelect: (team: SelectedTeam) => void
}

export default function MundialGroups({ standings, fixtures, onTeamSelect }: Props) {
  const groupsMap = new Map<string, GroupStanding[]>()
  standings.forEach(s => {
    if (!groupsMap.has(s.group_name)) groupsMap.set(s.group_name, [])
    groupsMap.get(s.group_name)!.push(s)
  })

  const fixturesMap = new Map<string, Fixture[]>()
  fixtures.forEach(f => {
    const g = f.group_name ?? "Sin Grupo"
    if (!fixturesMap.has(g)) fixturesMap.set(g, [])
    fixturesMap.get(g)!.push(f)
  })

  const allGroups = Array.from(
    new Set([...groupsMap.keys(), ...fixturesMap.keys()])
  ).sort()

  if (allGroups.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">⏳</div>
        <p className="font-bold mb-1" style={{ color: "#111827" }}>Sin datos de grupos todavía</p>
        <p className="text-[#6b7280] text-sm">Los standings se actualizan durante el torneo</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {allGroups.map(groupName => {
        const groupStandings = groupsMap.get(groupName) ?? []
        const groupFixtures  = fixturesMap.get(groupName) ?? []

        return (
          <div
            key={groupName}
            className="rounded-xl overflow-hidden"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            {/* Group header */}
            <div
              className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: "linear-gradient(90deg, #0d3318, #0d1f11)" }}
            >
              <span className="text-[#F5C518] font-black text-sm">⚽</span>
              <h2 className="font-black text-white text-sm uppercase tracking-wider">{groupName}</h2>
              <span className="ml-auto text-[#4a7a5a] text-xs font-medium">Selecciona un equipo</span>
            </div>

            {/* Standings — each row is a button that selects the team */}
            {groupStandings.length > 0 && (
              <>
                <div
                  className="grid gap-0 px-3 py-1.5 text-[#4b5563] text-xs font-bold uppercase tracking-wider"
                  style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", gridTemplateColumns: "1fr 26px 26px 26px 26px 30px 34px 18px" }}
                >
                  <span>Equipo</span>
                  <span className="text-center">J</span>
                  <span className="text-center">G</span>
                  <span className="text-center">E</span>
                  <span className="text-center">P</span>
                  <span className="text-center">DG</span>
                  <span className="text-center text-[#d97706]">Pts</span>
                  <span />
                </div>

                {groupStandings.map((team, idx) => (
                  <button
                    key={team.id}
                    onClick={() => onTeamSelect({
                      teamId:   team.team_id,
                      teamName: team.team_name,
                      teamFlag: team.team_flag,
                    })}
                    title={`Ver información de ${team.team_name}`}
                    className={`w-full grid gap-0 px-3 py-2 items-center border-t border-[#f3f4f6] text-left transition-colors group hover:bg-[#fef3c7] ${idx < 2 ? "bg-[#fffbeb]" : "bg-white"}`}
                    style={{ gridTemplateColumns: "1fr 26px 26px 26px 26px 30px 34px 18px" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {idx < 2
                        ? <div className="w-0.5 h-4 rounded-full bg-[#F5C518] flex-shrink-0" />
                        : <div className="w-0.5 h-4 flex-shrink-0" />
                      }
                      {team.team_flag && (
                        <img src={team.team_flag} alt="" className="w-5 h-3.5 object-contain rounded-sm flex-shrink-0" />
                      )}
                      <span className="text-[#111827] text-xs font-medium truncate">{team.team_name}</span>
                    </div>
                    <span className="text-center text-[#374151] text-xs">{team.played}</span>
                    <span className="text-center text-green-600 text-xs font-medium">{team.won}</span>
                    <span className="text-center text-[#d97706] text-xs">{team.drawn}</span>
                    <span className="text-center text-red-500 text-xs">{team.lost}</span>
                    <span className="text-center text-[#374151] text-xs">
                      {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                    </span>
                    <span className={`text-center font-black text-sm ${idx < 2 ? "text-[#d97706]" : "text-[#111827]"}`}>
                      {team.points}
                    </span>
                    {/* Chevron hint visible on hover */}
                    <span className="text-[#9ca3af] text-xs opacity-0 group-hover:opacity-100 transition-opacity">›</span>
                  </button>
                ))}
              </>
            )}

            {/* Fixtures — divider separates from standings clearly */}
            {groupFixtures.length > 0 && (
              <div className="border-t-2 border-[#e5e7eb]">
                <div className="px-3 py-1 bg-[#f9fafb]">
                  <span className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wider">Partidos</span>
                </div>
                {groupFixtures.map(f => {
                  const kickoff   = f.kickoff
                    ? new Date(f.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
                    : "?"
                  const hasResult = f.home_score !== null
                  const isLive    = f.status === "live"

                  return (
                    <Link
                      key={f.id}
                      href={`/fixtures/${f.id}`}
                      className="flex items-center gap-2 px-3 py-2 border-t border-[#f3f4f6] hover:bg-[#f9fafb] transition-colors"
                    >
                      <span className="text-[#9ca3af] text-xs w-10 text-right flex-shrink-0">{kickoff}</span>
                      <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
                        {f.home_team_flag && (
                          <img src={f.home_team_flag} alt="" className="w-4 h-3 object-contain flex-shrink-0 rounded-sm" />
                        )}
                        <span className="text-[#111827] text-xs truncate">{f.home_team_name}</span>
                      </div>
                      <div className="flex-shrink-0 text-center min-w-[44px]">
                        {isLive ? (
                          <span className="text-red-500 text-xs font-bold animate-pulse">
                            {f.home_score}–{f.away_score}
                          </span>
                        ) : hasResult ? (
                          <span className="text-[#d97706] text-xs font-black">{f.home_score}–{f.away_score}</span>
                        ) : (
                          <span className="text-[#9ca3af] text-xs">vs</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {f.away_team_flag && (
                          <img src={f.away_team_flag} alt="" className="w-4 h-3 object-contain flex-shrink-0 rounded-sm" />
                        )}
                        <span className="text-[#111827] text-xs truncate">{f.away_team_name}</span>
                      </div>
                      <span className="text-[#9ca3af] text-xs flex-shrink-0">›</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
