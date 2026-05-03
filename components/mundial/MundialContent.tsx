"use client"

import { useState } from "react"
import type { Fixture, GroupStanding } from "@/lib/types"
import MundialGroups from "./MundialGroups"
import MundialCalendar from "./MundialCalendar"
import MundialKnockouts from "./MundialKnockouts"
import MundialTeams from "./MundialTeams"
import TopScorers from "./TopScorers"
import type { TopScorer } from "./TopScorers"

type Tab = "grupos" | "calendario" | "fase-eliminatoria" | "equipos" | "goleadores"

export interface SelectedTeam {
  teamId: number
  teamName: string
  teamFlag: string | null
}

interface Props {
  standings: GroupStanding[]
  fixtures: Fixture[]
  topScorers: TopScorer[]
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "grupos",             label: "Grupos",            icon: "🏟" },
  { id: "calendario",         label: "Calendario",        icon: "📅" },
  { id: "fase-eliminatoria",  label: "Fase Eliminatoria", icon: "🏆" },
  { id: "equipos",            label: "Equipos",           icon: "🌍" },
  { id: "goleadores",         label: "Goleadores",        icon: "⚽" },
]

export default function MundialContent({ standings, fixtures, topScorers }: Props) {
  const [tab, setTab] = useState<Tab>("grupos")
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null)

  // Used by Groups & Calendar: select team AND switch to Equipos tab
  function handleTeamSelectWithNav(team: SelectedTeam) {
    setSelectedTeam(team)
    setTab("equipos")
  }

  const groupFixtures    = fixtures.filter(f => f.phase === "groups")
  const knockoutFixtures = fixtures.filter(f => f.phase && f.phase !== "groups")

  // Team goals: derived from all finished fixtures (for "País con más goles" section)
  const teamGoalsMap = new Map<number, { name: string; flag: string | null; goals: number }>()
  for (const f of fixtures) {
    if (f.home_score === null || f.away_score === null) continue
    if (f.home_team_id) {
      const e = teamGoalsMap.get(f.home_team_id) ?? { name: f.home_team_name ?? "", flag: f.home_team_flag ?? null, goals: 0 }
      e.goals += f.home_score
      teamGoalsMap.set(f.home_team_id, e)
    }
    if (f.away_team_id) {
      const e = teamGoalsMap.get(f.away_team_id) ?? { name: f.away_team_name ?? "", flag: f.away_team_flag ?? null, goals: 0 }
      e.goals += f.away_score
      teamGoalsMap.set(f.away_team_id, e)
    }
  }
  const teamGoals = [...teamGoalsMap.values()]
    .filter(t => t.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 10)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Tab bar */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TABS.map(tb => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === tb.id
                ? "text-white"
                : "text-[#6b7280] border border-[#d1d5db] hover:border-[#9ca3af] hover:text-[#111827] bg-white"
            }`}
            style={tab === tb.id ? { background: "#111827" } : {}}
          >
            <span className="text-base leading-none">{tb.icon}</span>
            <span>{tb.label}</span>
            {tb.id === "equipos" && selectedTeam && (
              <span className="ml-1 max-w-[80px] truncate text-xs opacity-70">
                · {selectedTeam.teamName}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "grupos" && (
        <MundialGroups
          standings={standings}
          fixtures={groupFixtures}
          onTeamSelect={handleTeamSelectWithNav}
        />
      )}
      {tab === "calendario" && (
        <MundialCalendar fixtures={fixtures} />
      )}
      {tab === "fase-eliminatoria" && (
        <MundialKnockouts fixtures={knockoutFixtures} />
      )}
      {tab === "equipos" && (
        <MundialTeams
          standings={standings}
          groupFixtures={groupFixtures}
          selectedTeam={selectedTeam}
          onTeamSelect={(team) => setSelectedTeam(team)}
        />
      )}
      {tab === "goleadores" && (
        <div>
          <h2 className="text-lg font-black mb-4" style={{ color: "#111827" }}>
            Máximos goleadores
          </h2>
          <TopScorers topScorers={topScorers} />

          {teamGoals.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-black mb-4" style={{ color: "#111827" }}>
                País con más goles
              </h2>
              <div className="flex flex-col gap-2 max-w-xl mx-auto">
                {teamGoals.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "white", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
                  >
                    <div className="w-6 flex justify-center flex-shrink-0">
                      {i === 0 ? <span className="text-base">🥇</span>
                        : i === 1 ? <span className="text-base">🥈</span>
                        : i === 2 ? <span className="text-base">🥉</span>
                        : <span className="text-xs font-black w-5 text-center" style={{ color: "#6b7280" }}>{i + 1}</span>
                      }
                    </div>
                    {t.flag && (
                      <img
                        src={t.flag}
                        alt={t.name}
                        className="w-8 h-5 object-contain flex-shrink-0 rounded-sm"
                        style={{ border: "1px solid #e5e7eb" }}
                      />
                    )}
                    <span className="flex-1 text-sm font-bold truncate" style={{ color: "#111827" }}>{t.name}</span>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="text-xl font-black leading-none" style={{ color: "#111827" }}>{t.goals}</span>
                      <span className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>goles</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
