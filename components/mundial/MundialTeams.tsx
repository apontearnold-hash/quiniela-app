"use client"

import TeamContextCard from "@/components/TeamContextCard"
import type { Fixture, GroupStanding } from "@/lib/types"
import type { SelectedTeam } from "./MundialContent"

interface TeamEntry {
  teamId:    number
  teamName:  string
  teamFlag:  string | null
}

interface Props {
  standings:     GroupStanding[]
  groupFixtures: Fixture[]
  selectedTeam:  SelectedTeam | null
  onTeamSelect:  (team: SelectedTeam) => void
}

function buildGroupsMap(
  standings: GroupStanding[],
  groupFixtures: Fixture[],
): Map<string, TeamEntry[]> {
  const map = new Map<string, TeamEntry[]>()

  if (standings.length > 0) {
    // Preferred source: groups table
    standings.forEach(s => {
      if (!map.has(s.group_name)) map.set(s.group_name, [])
      map.get(s.group_name)!.push({
        teamId:   s.team_id,
        teamName: s.team_name,
        teamFlag: s.team_flag,
      })
    })
  } else {
    // Fallback: deduce unique teams from group fixtures
    const seen = new Set<number>()
    groupFixtures.forEach(f => {
      const grp = f.group_name
      if (!grp) return

      if (f.home_team_id && f.home_team_name && !seen.has(f.home_team_id)) {
        seen.add(f.home_team_id)
        if (!map.has(grp)) map.set(grp, [])
        map.get(grp)!.push({ teamId: f.home_team_id, teamName: f.home_team_name, teamFlag: f.home_team_flag })
      }
      if (f.away_team_id && f.away_team_name && !seen.has(f.away_team_id)) {
        seen.add(f.away_team_id)
        if (!map.has(grp)) map.set(grp, [])
        map.get(grp)!.push({ teamId: f.away_team_id, teamName: f.away_team_name, teamFlag: f.away_team_flag })
      }
    })
  }

  return map
}

export default function MundialTeams({ standings, groupFixtures, selectedTeam, onTeamSelect }: Props) {
  const groupsMap = buildGroupsMap(standings, groupFixtures)
  const allGroups = Array.from(groupsMap.keys()).sort()
  const hasTeams  = allGroups.length > 0

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start">

      {/* ── Left: team list ─────────────────────────────────────────── */}
      <div className="w-full md:w-60 flex-shrink-0">
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: "linear-gradient(90deg, #0d3318, #0d1f11)" }}
          >
            <span className="text-[#F5C518] font-black text-sm">🌍</span>
            <h2 className="font-black text-white text-sm uppercase tracking-wider">
              {hasTeams ? `${allGroups.length} Grupos · ${standings.length || groupFixtures.length > 0 ? "48 equipos" : ""}` : "Equipos"}
            </h2>
          </div>

          {!hasTeams ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[#9ca3af] text-sm">Sin datos de equipos todavía</p>
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)", minHeight: "200px" }}>
              {allGroups.map(groupName => {
                const teams = groupsMap.get(groupName) ?? []
                return (
                  <div key={groupName}>
                    {/* Group label */}
                    <div
                      className="px-3 py-1 sticky top-0 z-10"
                      style={{ background: "#f9fafb", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}
                    >
                      <span className="text-[#374151] text-xs font-black uppercase tracking-wider">
                        {groupName}
                      </span>
                    </div>

                    {/* Team rows */}
                    {teams.map(team => {
                      const isSelected = selectedTeam?.teamId === team.teamId
                      return (
                        <button
                          key={team.teamId}
                          onClick={() => onTeamSelect({
                            teamId:   team.teamId,
                            teamName: team.teamName,
                            teamFlag: team.teamFlag,
                          })}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 border-b border-[#f3f4f6] text-left transition-colors ${
                            isSelected ? "bg-[#fef3c7]" : "bg-white hover:bg-[#f9fafb]"
                          }`}
                        >
                          {team.teamFlag
                            ? <img src={team.teamFlag} alt="" className="w-6 h-4 object-contain flex-shrink-0 rounded-sm" />
                            : <span className="w-6 h-4 rounded-sm bg-[#e5e7eb] flex-shrink-0" />
                          }
                          <span className={`text-sm font-medium truncate flex-1 ${isSelected ? "text-[#92400e]" : "text-[#111827]"}`}>
                            {team.teamName}
                          </span>
                          {isSelected && <span className="text-[#d97706] text-xs flex-shrink-0">●</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: team detail ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 w-full">
        {!selectedTeam ? (
          <div
            className="rounded-xl p-8 text-center flex flex-col items-center justify-center"
            style={{ background: "white", border: "1px solid #d1d5db", minHeight: "180px" }}
          >
            <p className="text-3xl mb-2">👈</p>
            <p className="font-bold text-[#111827]">Selecciona un equipo</p>
            <p className="text-[#6b7280] text-sm mt-1 max-w-xs">
              {hasTeams
                ? "Elige un país de la lista para ver su información de clasificación."
                : "La información estará disponible cuando el torneo comience."}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4 px-1">
              {selectedTeam.teamFlag && (
                <img src={selectedTeam.teamFlag} alt="" className="w-10 h-7 object-contain rounded-sm flex-shrink-0" />
              )}
              <div>
                <h2 className="font-black text-[#111827] text-lg leading-tight">{selectedTeam.teamName}</h2>
                <p className="text-[#6b7280] text-xs mt-0.5">Contexto de clasificación al Mundial 2026</p>
              </div>
            </div>
            <TeamContextCard
              teamId={selectedTeam.teamId}
              teamName={selectedTeam.teamName}
              teamFlag={selectedTeam.teamFlag}
            />
          </div>
        )}
      </div>

    </div>
  )
}
