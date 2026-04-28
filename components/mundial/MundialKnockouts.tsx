"use client"

import Link from "next/link"
import type { Fixture, Phase } from "@/lib/types"
import { BRACKET_FIXTURES } from "@/lib/bracket-slots"

const PHASES: Phase[] = ["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]
const PHASE_LABELS: Record<string, string> = {
  round_of_32:   "R32",
  round_of_16:   "Octavos",
  quarterfinals: "Cuartos",
  semifinals:    "Semis",
  final:         "Final",
}

interface Props {
  fixtures: Fixture[]
}

function BracketCard({ fixture }: { fixture: Fixture }) {
  const homeName  = fixture.home_team_name ?? fixture.home_placeholder ?? "TBD"
  const awayName  = fixture.away_team_name ?? fixture.away_placeholder ?? "TBD"
  const hasResult = fixture.home_score !== null
  const isLive    = fixture.status === "live"
  const homeWins  = hasResult && fixture.home_score! > fixture.away_score!
  const awayWins  = hasResult && fixture.away_score! > fixture.home_score!
  const hasTeams  = !!(fixture.home_team_name || fixture.away_team_name)

  const inner = (
    <div
      className="w-44 flex-shrink-0 rounded-lg px-2.5 py-2 flex flex-col gap-1.5 transition-colors"
      style={{
        background: "white",
        border: isLive
          ? "1px solid #fbbf24"
          : hasResult
          ? "1px solid #16a34a"
          : "1px solid #d1d5db",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Slot key + status */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold text-[#9ca3af]">
          {fixture.bracket_position ?? fixture.round ?? ""}
        </span>
        {isLive && (
          <span className="text-[10px] font-bold text-red-500 animate-pulse">
            {fixture.elapsed ? `${fixture.elapsed}'` : "LIVE"}
          </span>
        )}
        {!isLive && hasResult && (
          <span className="text-[10px] font-bold text-green-600">FT</span>
        )}
        {!isLive && !hasResult && fixture.kickoff && (
          <span className="text-[10px] text-[#9ca3af]">
            {new Date(fixture.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Home row */}
      <div className="flex items-center gap-2">
        {fixture.home_team_flag
          ? <img src={fixture.home_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
          : <span className="w-5 h-3.5 rounded-sm bg-[#f3f4f6] flex-shrink-0" />
        }
        <span className={`text-xs font-medium flex-1 truncate leading-tight ${
          homeWins ? "text-[#d97706] font-bold" : hasTeams ? "text-[#111827]" : "text-[#9ca3af]"
        }`}>
          {homeName}
        </span>
        {hasResult && (
          <span className={`text-sm font-black flex-shrink-0 ${homeWins ? "text-[#d97706]" : "text-[#6b7280]"}`}>
            {fixture.home_score}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-[#f3f4f6]" />

      {/* Away row */}
      <div className="flex items-center gap-2">
        {fixture.away_team_flag
          ? <img src={fixture.away_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
          : <span className="w-5 h-3.5 rounded-sm bg-[#f3f4f6] flex-shrink-0" />
        }
        <span className={`text-xs font-medium flex-1 truncate leading-tight ${
          awayWins ? "text-[#d97706] font-bold" : hasTeams ? "text-[#111827]" : "text-[#9ca3af]"
        }`}>
          {awayName}
        </span>
        {hasResult && (
          <span className={`text-sm font-black flex-shrink-0 ${awayWins ? "text-[#d97706]" : "text-[#6b7280]"}`}>
            {fixture.away_score}
          </span>
        )}
      </div>

      {/* Penalty note */}
      {fixture.went_to_penalties && fixture.penalties_winner && (
        <p className="text-[10px] text-center text-[#9ca3af]">
          Pen: {fixture.penalties_winner === "home" ? homeName : awayName}
        </p>
      )}
    </div>
  )

  if (fixture.id < 9_000_001) {
    return (
      <Link href={`/fixtures/${fixture.id}`} className="block hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    )
  }
  return inner
}

export default function MundialKnockouts({ fixtures }: Props) {
  // Merge: BRACKET_FIXTURES as template, real Supabase data overrides by bracket_position
  const realByPosition = new Map<string, Fixture>()
  fixtures.forEach(f => {
    if (f.bracket_position) realByPosition.set(f.bracket_position, f)
  })
  const allDisplay = BRACKET_FIXTURES.map(bf =>
    realByPosition.get(bf.bracket_position!) ?? bf
  )

  // Group by phase (keep 3P separate)
  const byPhase = new Map<Phase, Fixture[]>()
  PHASES.forEach(p => byPhase.set(p, []))
  allDisplay.forEach(f => {
    if (f.phase && f.phase !== "groups" && f.bracket_position !== "3P") {
      const arr = byPhase.get(f.phase as Phase)
      if (arr) arr.push(f)
    }
  })
  const thirdPlace = allDisplay.find(f => f.bracket_position === "3P")

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* Header — dark green accent matching the rest of the app */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ background: "linear-gradient(90deg, #0d3318, #0d1f11)" }}
      >
        <span className="text-[#F5C518] font-black text-sm">🏆</span>
        <h2 className="font-black text-white text-sm uppercase tracking-wider">Fase Eliminatoria · Mundial 2026</h2>
        <span className="ml-auto text-[#4a7a5a] text-xs">scroll →</span>
      </div>

      {/* Bracket body */}
      <div className="p-4 overflow-x-auto pb-5">
        <div className="flex gap-3 min-w-max items-start">
          {PHASES.map((phase, phaseIdx) => {
            const phaseFixtures = byPhase.get(phase) ?? []
            if (phaseFixtures.length === 0) return null

            const nextPhase = PHASES[phaseIdx + 1]
            const hasNext   = nextPhase ? (byPhase.get(nextPhase)?.length ?? 0) > 0 : false

            return (
              <div key={phase} className="flex items-center gap-3">
                {/* Phase column */}
                <div className="flex flex-col gap-2">
                  {/* Phase label */}
                  <div className="text-center mb-0.5">
                    <p className="text-[#374151] font-bold text-xs uppercase tracking-wider">
                      {PHASE_LABELS[phase]}
                    </p>
                    <p className="text-[#9ca3af] text-[10px]">{phaseFixtures.length} partidos</p>
                  </div>

                  {phaseFixtures.map(f => (
                    <BracketCard key={f.id} fixture={f} />
                  ))}

                  {/* Third-place under SF column */}
                  {phase === "semifinals" && thirdPlace && (
                    <div className="mt-4">
                      <p className="text-[#6b7280] text-[10px] text-center mb-2 font-bold uppercase tracking-wider">
                        3er Lugar
                      </p>
                      <BracketCard fixture={thirdPlace} />
                    </div>
                  )}
                </div>

                {/* Arrow connector */}
                {hasNext && (
                  <div className="self-center pb-10">
                    <span className="font-bold text-lg text-[#d1d5db]">›</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer legend */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 flex-wrap"
        style={{ borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-green-500 inline-block" />
          <span className="text-[10px] text-[#6b7280]">Finalizado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-amber-400 inline-block" />
          <span className="text-[10px] text-[#6b7280]">En vivo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded bg-[#d1d5db] inline-block" />
          <span className="text-[10px] text-[#6b7280]">Por disputarse</span>
        </div>
        <span className="text-[10px] text-[#9ca3af] ml-auto">
          {fixtures.length === 0 ? "Estructura pre-torneo" : `${fixtures.length} partidos reales`}
        </span>
      </div>
    </div>
  )
}
