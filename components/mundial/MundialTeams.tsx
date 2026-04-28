"use client"

import TeamContextCard from "@/components/TeamContextCard"
import type { GroupStanding } from "@/lib/types"
import type { SelectedTeam } from "./MundialContent"

interface Props {
  standings: GroupStanding[]
  selectedTeam: SelectedTeam | null
  onTeamSelect: (team: SelectedTeam) => void
}

export default function MundialTeams({ standings, selectedTeam, onTeamSelect }: Props) {
  // Build groups map
  const groupsMap = new Map<string, GroupStanding[]>()
  standings.forEach(s => {
    if (!groupsMap.has(s.group_name)) groupsMap.set(s.group_name, [])
    groupsMap.get(s.group_name)!.push(s)
  })
  const allGroups = Array.from(groupsMap.keys()).sort()

  const hasStandings = allGroups.length > 0

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* ── Left column: team list ─────────────────────────────────── */}
      <div className="md:w-64 flex-shrink-0">
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
        >
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: "linear-gradient(90deg, #0d3318, #0d1f11)" }}
          >
            <span className="text-[#F5C518] font-black text-sm">🌍</span>
            <h2 className="font-black text-white text-sm uppercase tracking-wider">Selecciona Equipo</h2>
          </div>

          {!hasStandings ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[#9ca3af] text-sm">Sin datos de grupos todavía</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[70vh] md:max-h-[600px]">
              {allGroups.map(groupName => {
                const teams = groupsMap.get(groupName) ?? []
                return (
                  <div key={groupName}>
                    {/* Group label */}
                    <div
                      className="px-3 py-1.5 flex items-center gap-2 sticky top-0 z-10"
                      style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", borderTop: "1px solid #e5e7eb" }}
                    >
                      <span className="text-[#374151] text-xs font-black uppercase tracking-wider">{groupName}</span>
                    </div>

                    {/* Team rows */}
                    {teams.map(team => {
                      const isSelected = selectedTeam?.teamId === team.team_id
                      return (
                        <button
                          key={team.id}
                          onClick={() => onTeamSelect({
                            teamId:   team.team_id,
                            teamName: team.team_name,
                            teamFlag: team.team_flag,
                          })}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-[#f3f4f6] text-left transition-colors ${
                            isSelected
                              ? "bg-[#fef3c7]"
                              : "bg-white hover:bg-[#fafafa]"
                          }`}
                        >
                          {team.team_flag
                            ? <img src={team.team_flag} alt="" className="w-6 h-4 object-contain flex-shrink-0 rounded-sm" />
                            : <span className="w-6 h-4 rounded-sm bg-[#e5e7eb] flex-shrink-0" />
                          }
                          <span className={`text-sm font-medium truncate flex-1 ${isSelected ? "text-[#92400e]" : "text-[#111827]"}`}>
                            {team.team_name}
                          </span>
                          {isSelected && (
                            <span className="text-[#d97706] text-xs flex-shrink-0">●</span>
                          )}
                          {team.points > 0 && (
                            <span className="text-[#9ca3af] text-xs flex-shrink-0 tabular-nums">{team.points}pts</span>
                          )}
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

      {/* ── Right column: team detail ──────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!selectedTeam ? (
          <div
            className="rounded-xl p-8 text-center h-full flex flex-col items-center justify-center"
            style={{ background: "white", border: "1px solid #d1d5db", minHeight: "200px" }}
          >
            <div className="text-4xl mb-3">👈</div>
            <p className="font-bold text-[#111827] text-base">Selecciona un equipo</p>
            <p className="text-[#6b7280] text-sm mt-1 max-w-xs">
              {hasStandings
                ? "Elige un país de la lista para ver su información de clasificación al Mundial."
                : "La información estará disponible cuando el torneo comience."}
            </p>
          </div>
        ) : (
          <div>
            {/* Team header */}
            <div className="flex items-center gap-3 mb-4 px-1">
              {selectedTeam.teamFlag && (
                <img
                  src={selectedTeam.teamFlag}
                  alt=""
                  className="w-10 h-7 object-contain rounded-sm flex-shrink-0 shadow-sm"
                />
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
