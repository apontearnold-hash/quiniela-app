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
  fixtures: Fixture[]   // knockout fixtures from Supabase (may be empty pre-tournament)
}

// Read-only bracket card
function BracketCard({ fixture }: { fixture: Fixture }) {
  const homeName = fixture.home_team_name ?? fixture.home_placeholder ?? "TBD"
  const awayName = fixture.away_team_name ?? fixture.away_placeholder ?? "TBD"
  const hasResult = fixture.home_score !== null
  const isLive = fixture.status === "live"
  const homeWins = hasResult && fixture.home_score! > fixture.away_score!
  const awayWins = hasResult && fixture.away_score! > fixture.home_score!
  const hasTeams = !!(fixture.home_team_name || fixture.away_team_name)

  const inner = (
    <div
      className="w-44 flex-shrink-0 rounded-lg px-2.5 py-2 flex flex-col gap-1.5 transition-colors"
      style={{
        background: hasResult ? "rgba(10,18,8,0.92)" : "rgba(10,18,8,0.80)",
        border: isLive
          ? "1px solid #fbbf24"
          : hasResult
          ? "1px solid #2a7a4a"
          : hasTeams
          ? "1px solid #2a5438"
          : "1px solid #1a3322",
      }}
    >
      {/* Slot key + status */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold" style={{ color: "#4a7a5a" }}>
          {fixture.bracket_position ?? fixture.round ?? ""}
        </span>
        {isLive && (
          <span className="text-[10px] font-bold text-red-400 animate-pulse">
            {fixture.elapsed ? `${fixture.elapsed}'` : "LIVE"}
          </span>
        )}
        {!isLive && hasResult && (
          <span className="text-[10px] font-bold text-green-400">FT</span>
        )}
        {!isLive && !hasResult && fixture.kickoff && (
          <span className="text-[10px]" style={{ color: "#4a7a5a" }}>
            {new Date(fixture.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Home row */}
      <div className="flex items-center gap-2">
        {fixture.home_team_flag
          ? <img src={fixture.home_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
          : <span className="w-5 h-3.5 rounded-sm flex-shrink-0" style={{ background: "#1a3322" }} />
        }
        <span
          className="text-xs font-medium flex-1 truncate leading-tight"
          style={{ color: homeWins ? "#F5C518" : hasTeams ? "#f1f5f9" : "#4a7a5a" }}
        >
          {homeName}
        </span>
        {hasResult && (
          <span className="text-sm font-black flex-shrink-0" style={{ color: homeWins ? "#F5C518" : "#9ca3af" }}>
            {fixture.home_score}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: "#1a3322" }} />

      {/* Away row */}
      <div className="flex items-center gap-2">
        {fixture.away_team_flag
          ? <img src={fixture.away_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
          : <span className="w-5 h-3.5 rounded-sm flex-shrink-0" style={{ background: "#1a3322" }} />
        }
        <span
          className="text-xs font-medium flex-1 truncate leading-tight"
          style={{ color: awayWins ? "#F5C518" : hasTeams ? "#f1f5f9" : "#4a7a5a" }}
        >
          {awayName}
        </span>
        {hasResult && (
          <span className="text-sm font-black flex-shrink-0" style={{ color: awayWins ? "#F5C518" : "#9ca3af" }}>
            {fixture.away_score}
          </span>
        )}
      </div>

      {/* Penalty note */}
      {fixture.went_to_penalties && fixture.penalties_winner && (
        <p className="text-[10px] text-center" style={{ color: "#4a7a5a" }}>
          Pen: {fixture.penalties_winner === "home" ? homeName : awayName}
        </p>
      )}
    </div>
  )

  // Wrap in Link if it has a real fixture ID (not a static bracket slot ID >= 9000001)
  if (fixture.id < 9_000_001) {
    return (
      <Link href={`/fixtures/${fixture.id}`} className="block hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    )
  }
  return inner
}

export default function MundialKnockouts({ fixtures }: Props) {
  // Build a position→fixture map from real Supabase data
  const realByPosition = new Map<string, Fixture>()
  fixtures.forEach(f => {
    if (f.bracket_position) realByPosition.set(f.bracket_position, f)
  })

  // Use BRACKET_FIXTURES as the template; override with real data where available
  const allDisplay = BRACKET_FIXTURES.map(bf =>
    realByPosition.get(bf.bracket_position!) ?? bf
  )

  // Group by phase
  const byPhase = new Map<Phase, Fixture[]>()
  PHASES.forEach(p => byPhase.set(p, []))
  allDisplay.forEach(f => {
    if (f.phase && f.phase !== "groups") {
      const phase = f.phase as Phase
      // Keep 3P (third place) separate — it's tagged as "semifinals"
      if (f.bracket_position === "3P") return
      const arr = byPhase.get(phase)
      if (arr) arr.push(f)
    }
  })

  // Third-place game
  const thirdPlace = allDisplay.find(f => f.bracket_position === "3P")

  const hasAnyRealData = fixtures.length > 0

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "linear-gradient(135deg, #0a1208, #0d1f11)", border: "1px solid #1a3322" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest">Fase Eliminatoria</h2>
        <div className="flex-1 h-px" style={{ background: "#1a3322" }} />
        {!hasAnyRealData && (
          <span className="text-[#4a7a5a] text-xs">Estructura del torneo</span>
        )}
      </div>

      {/* Horizontal scroll bracket */}
      <div className="overflow-x-auto pb-3 -mx-1 px-1">
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
                    <p className="text-[#F5C518] font-bold text-xs uppercase tracking-wider">
                      {PHASE_LABELS[phase]}
                    </p>
                    <p className="text-[#2a5438] text-[10px]">{phaseFixtures.length} partidos</p>
                  </div>

                  {/* Match cards */}
                  {phaseFixtures.map(f => (
                    <BracketCard key={f.id} fixture={f} />
                  ))}

                  {/* Third-place game under SF column */}
                  {phase === "semifinals" && thirdPlace && (
                    <div className="mt-3">
                      <p className="text-[#7ab88a] text-[10px] text-center mb-2 font-bold uppercase tracking-wider">
                        3er Lugar
                      </p>
                      <BracketCard fixture={thirdPlace} />
                    </div>
                  )}
                </div>

                {/* Arrow connector */}
                {hasNext && (
                  <div className="self-center pb-8">
                    <span className="font-bold text-lg" style={{ color: "#2a5438" }}>›</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 flex-wrap" style={{ borderTop: "1px solid #1a3322" }}>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: "#2a7a4a", display: "inline-block" }} />
          <span className="text-[10px]" style={{ color: "#4a7a5a" }}>Finalizado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: "#fbbf24", display: "inline-block" }} />
          <span className="text-[10px]" style={{ color: "#4a7a5a" }}>En vivo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: "#2a5438", display: "inline-block" }} />
          <span className="text-[10px]" style={{ color: "#4a7a5a" }}>Por disputarse</span>
        </div>
        <span className="text-[10px] ml-auto" style={{ color: "#2a5438" }}>
          ← scroll horizontal en móvil
        </span>
      </div>
    </div>
  )
}
