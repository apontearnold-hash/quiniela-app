"use client"

import { useState } from "react"
import type { Fixture, GroupStanding } from "@/lib/types"
import MundialGroups from "./MundialGroups"
import MundialCalendar from "./MundialCalendar"
import MundialKnockouts from "./MundialKnockouts"
import MundialTeams from "./MundialTeams"

type Tab = "grupos" | "calendario" | "fase-eliminatoria" | "equipos"

export interface SelectedTeam {
  teamId: number
  teamName: string
  teamFlag: string | null
}

interface Props {
  standings: GroupStanding[]
  fixtures: Fixture[]
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "grupos",             label: "Grupos",           icon: "🏟" },
  { id: "calendario",         label: "Calendario",       icon: "📅" },
  { id: "fase-eliminatoria",  label: "Fase Eliminatoria", icon: "🏆" },
  { id: "equipos",            label: "Equipos",          icon: "🌍" },
]

export default function MundialContent({ standings, fixtures }: Props) {
  const [tab, setTab] = useState<Tab>("grupos")
  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null)

  // Used by Groups & Calendar: select team AND switch to Equipos tab
  function handleTeamSelectWithNav(team: SelectedTeam) {
    setSelectedTeam(team)
    setTab("equipos")
  }

  const groupFixtures    = fixtures.filter(f => f.phase === "groups")
  const knockoutFixtures = fixtures.filter(f => f.phase && f.phase !== "groups")

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
          onTeamSelect={setSelectedTeam}
        />
      )}
    </div>
  )
}
